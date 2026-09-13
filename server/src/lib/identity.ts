// ── Identity-token verification (Firebase Auth + Google Sign-In) ───────────
//
// The Firebase popup on the login page hands the app an OIDC id_token. Two
// flavors exist and BOTH are accepted here:
//
//   1. Firebase-issued ID token (the result of `user.getIdToken()` — the
//      token Firebase itself signs after `signInWithPopup`). Header kid →
//      JWKS at securetoken@system.gcs.google.com, issuer
//      `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, audience =
//      the project id. This is the "proper" Firebase connection: signature,
//      issuer and audience are all checked, so a token from a DIFFERENT
//      Firebase project is rejected.
//
//   2. Google-issued OIDC token (`GoogleAuthProvider.credentialFromResult(
//      result).idToken`). Issuer `accounts.google.com` / `https://accounts.
//      google.com`, checked against Google's oauth2 JWKS. As a resilient
//      fallback this flavor can also be verified via Google's tokeninfo
//      endpoint (GOOGLE_TOKENINFO_URL) — overridable so tests can point it
//      at a local stub.
//
// Signature, expiry, issuer and (for Firebase tokens) audience are enforced
// with `jose` (RS256 against Google's public keys). No Firebase Admin SDK /
// service-account key is needed.
//
// OFFLINE RESILIENCE (JWKS disk cache): Google's public keys are fetched
// once and cached in data/identity-jwks-cache.json (same convention as the
// road-geometry cache). If the network is unreachable on a later boot —
// air-gapped demos, restrictive previews — the cached keys are used, so
// sign-in keeps working. The cache only ever stores PUBLIC keys, and the
// kid + signature checks still apply to every token.
import { createLocalJWKSet, jwtVerify, decodeJwt } from 'jose'
import fs from 'fs'
import path from 'path'

// JWKS endpoints. Overridable so tests / air-gapped CI can point them at a
// local stub — same convention as TWILIO_API_BASE / GOOGLE_TOKENINFO_URL.
const FIREBASE_JWKS_URL = () => env('FIREBASE_JWKS_URL') ?? 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const GOOGLE_JWKS_URL = () => env('GOOGLE_OIDC_JWKS_URL') ?? 'https://www.googleapis.com/oauth2/v3/certs'

const env = (k: string) => (process.env[k] ?? '').trim() || undefined

// The Firebase project the login popup signs in against. The built-in web
// config (setu-ner/src/lib/firebase.ts) uses project "new-project-6e761";
// FIREBASE_PROJECT_ID must match whatever VITE_FIREBASE_PROJECT_ID the
// frontend actually uses, otherwise its tokens are rejected (audience check).
export const firebaseProjectId = () => env('FIREBASE_PROJECT_ID') ?? 'new-project-6e761'
const googleTokenInfoUrl = () => env('GOOGLE_TOKENINFO_URL') ?? 'https://oauth2.googleapis.com/tokeninfo'

export interface VerifiedIdentity {
  /** Provider subject — stable unique id ("sub" for OIDC, "user_id" for Firebase). */
  sub: string
  email: string
  name: string
  /** Which flavor of token was presented. */
  via: 'firebase' | 'google'
  /** Firebase sign-in provider claim, when present (e.g. "google.com"). */
  signInProvider?: string
}

// ── JWKS loading with a disk cache ──────────────────────────────────────────

const CACHE_FILE = path.resolve(process.cwd(), 'data', 'identity-jwks-cache.json')

interface CachedJwks { fetchedAt: number; firebase?: unknown; google?: unknown }
let memoryCache: Partial<Record<'firebase' | 'google', unknown>> = {}

async function fetchJwks(url: string): Promise<unknown> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`JWKS ${url} → HTTP ${resp.status}`)
  return await resp.json()
}

function readCache(): CachedJwks | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as CachedJwks
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

function writeCache(entry: CachedJwks): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry))
  } catch (e) {
    console.warn('[identity] could not persist the JWKS cache:', (e as Error).message)
  }
}

/**
 * Returns Google's public keys for the given source — live from the network
 * when reachable, otherwise the disk cache. Throws a clear error when the
 * server has never been online (no cache) — that error is shown to the
 * user as "run once with internet" guidance.
 */
async function getJwks(source: 'firebase' | 'google') {
  const url = source === 'firebase' ? FIREBASE_JWKS_URL() : GOOGLE_JWKS_URL()
  const cached = memoryCache[source] ?? readCache()?.[source]
  try {
    const fresh = await fetchJwks(url)
    memoryCache[source] = fresh
    const full = { ...(readCache() ?? { fetchedAt: 0 }), [source]: fresh } as CachedJwks
    full.fetchedAt = Date.now()
    writeCache(full)
    return createLocalJWKSet(fresh as never)
  } catch (err) {
    if (cached) {
      if (!memoryCache[source]) {
        console.warn(`[identity] ${url} unreachable (${(err as Error).message}) — using cached public keys from ${new Date(readCache()?.fetchedAt ?? 0).toISOString()}`)
        memoryCache[source] = cached
      }
      return createLocalJWKSet(cached as never)
    }
    throw new Error(
      `The API server could not fetch Google's public sign-in keys from ${url} (${(err as Error).message}). `
      + `This server has no outbound internet. Run the server once on a machine with internet access (the keys are cached to data/identity-jwks-cache.json and reused offline), or deploy to a host with outbound access.`,
    )
  }
}

/** True when the decoded (unverified) payload looks Firebase-issued. */
function isFirebaseToken(payload: Record<string, unknown>): boolean {
  const iss = typeof payload.iss === 'string' ? payload.iss : ''
  return iss.startsWith('https://securetoken.google.com/') || typeof payload.firebase === 'object'
}

async function verifyFirebaseToken(idToken: string): Promise<VerifiedIdentity> {
  const projectId = firebaseProjectId()
  const jwks = await getJwks('firebase')
  const { payload } = await jwtVerify(idToken, jwks!, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  })
  const p = payload as { user_id?: string; sub?: string; email?: string; email_verified?: boolean; name?: string; firebase?: { sign_in_provider?: string } }
  if (!p.email) throw new Error('Firebase token has no email claim')
  if (p.email_verified === false) throw new Error('The Google account email is not verified')
  return {
    sub: p.user_id ?? p.sub ?? '',
    email: p.email.toLowerCase(),
    name: p.name ?? '',
    via: 'firebase',
    signInProvider: p.firebase?.sign_in_provider,
  }
}

async function verifyGoogleOidcToken(idToken: string): Promise<VerifiedIdentity> {
  // Primary: verify the RS256 signature + issuer against Google's public
  // JWKS (no network round-trip to tokeninfo, works at high QPS).
  try {
    const jwks = await getJwks('google')
    const { payload } = await jwtVerify(idToken, jwks!, {
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
    })
    const p = payload as { sub?: string; email?: string; email_verified?: boolean | string; name?: string }
    if (!p.sub || !p.email) throw new Error('Google token missing sub/email')
    if (p.email_verified === false || p.email_verified === 'false') throw new Error('The Google account email is not verified')
    return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? '', via: 'google' }
  } catch (err) {
    // Fall back to the tokeninfo endpoint (Google validates its own token).
    // This keeps deployments behind strict egress proxies working and lets
    // GOOGLE_TOKENINFO_URL point at a stub in offline tests.
    if (err instanceof Error && /no outbound internet/.test(err.message)) {
      // No keys anywhere — tokeninfo will fail too, but try it anyway in
      // case only the JWKS host is blocked.
    }
    return await verifyViaTokeninfo(idToken)
  }
}

async function verifyViaTokeninfo(idToken: string): Promise<VerifiedIdentity> {
  let resp: Response
  try {
    const url = `${googleTokenInfoUrl().replace(/\/+$/, '')}?id_token=${encodeURIComponent(idToken)}`
    resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    throw new Error(
      `Cannot reach Google to verify the sign-in (${(err as Error).message}). The API server needs outbound access to googleapis.com — run it on a machine with internet, or verify Google sign-in locally.`,
    )
  }
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error_description?: string; error?: string }
    throw new Error(err.error_description ?? err.error ?? `Google tokeninfo ${resp.status}`)
  }
  const info = (await resp.json()) as { sub?: string; email?: string; email_verified?: boolean | string; name?: string }
  if (!info.sub || !info.email) throw new Error('Google token missing sub/email')
  if (info.email_verified === false || info.email_verified === 'false') throw new Error('The Google account email is not verified')
  return { sub: info.sub, email: info.email.toLowerCase(), name: info.name ?? '', via: 'google' }
}

/**
 * Verifies a Firebase/Google OIDC id_token. Throws Error with a
 * human-readable message on any validation failure.
 */
export async function verifyIdentityToken(idToken: string): Promise<VerifiedIdentity> {
  let payload: Record<string, unknown>
  try {
    payload = decodeJwt(idToken)
  } catch {
    throw new Error('The sign-in token is malformed — please sign in again.')
  }
  try {
    return isFirebaseToken(payload) ? await verifyFirebaseToken(idToken) : await verifyGoogleOidcToken(idToken)
  } catch (err) {
    const msg = (err as Error).message ?? 'unknown error'
    if (/no outbound internet|Cannot reach Google/.test(msg)) throw err // already user-friendly
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
      throw new Error('Could not reach Google\'s public keys to verify the sign-in — the API server needs outbound access to googleapis.com. Try again, or run the server on a host with internet.')
    }
    if (/project|audience|issuer|unexpected "iss"|"aud"|"iss"/i.test(msg)) {
      throw new Error(`Sign-in token rejected: it was issued for a different Firebase project or OAuth client than this server accepts. Set FIREBASE_PROJECT_ID in server/.env to match VITE_FIREBASE_PROJECT_ID (${msg})`)
    }
    throw new Error(`Sign-in token could not be verified: ${msg}`)
  }
}
