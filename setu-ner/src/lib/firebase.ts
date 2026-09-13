// Firebase Authentication — "Sign in with Google" (login page).
//
// The Firebase JS SDK initializes from this project's built-in public web
// config (FIREBASE_DEFAULTS below), overridable by VITE_FIREBASE_* env vars.
// If neither is present the app never throws — the login page just shows the
// button disabled with a hint.
//
// PROPER Firebase flow (what makes this "connected through Firebase"):
//   1. signInWithPopup() signs the user in to Firebase Auth with Google.
//   2. We return the FIREBASE-ISSUED ID token via user.getIdToken() — signed
//      by Firebase (issuer https://securetoken.google.com/<project>, aud
//      <project>). The server verifies exactly that: signature against
//      Google's public JWKs + issuer + audience vs FIREBASE_PROJECT_ID, so a
//      token from any other Firebase project is rejected.
//   3. Google's raw OAuth credential (credentialFromResult) is kept only as a
//      fallback when getIdToken somehow fails — the server verifies that
//      flavor too.
// A popup blocked by the browser falls back to signInWithRedirect()
// automatically; call resumeRedirectSignIn() once when the login page mounts.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, type Auth,
} from 'firebase/auth'

// Public Firebase web config for this project. These values identify the
// project — they are NOT secrets (Google's own guidance: web API keys are
// safe to embed; security comes from Firebase Auth authorized domains +
// security rules). They work as built-in defaults so a fresh clone / deploy
// has Google sign-in even without copying .env.example to .env; any
// VITE_FIREBASE_* env var still overrides them.
const FIREBASE_DEFAULTS = {
  apiKey: 'AIzaSyAAbr1aWWglmYuwCvGMJJRq3083Ph-wGos',
  authDomain: 'new-project-6e761.firebaseapp.com',
  projectId: 'new-project-6e761',
  appId: '1:695935356647:web:c92b327ff8d0b69393dc42',
}

const envOr = (v: string | undefined, fallback: string) => {
  const t = v?.trim()
  return t && t.length ? t : fallback
}

const cfg = {
  apiKey: envOr(import.meta.env.VITE_FIREBASE_API_KEY as string | undefined, FIREBASE_DEFAULTS.apiKey),
  authDomain: envOr(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined, FIREBASE_DEFAULTS.authDomain),
  projectId: envOr(import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined, FIREBASE_DEFAULTS.projectId),
  appId: envOr(import.meta.env.VITE_FIREBASE_APP_ID as string | undefined, FIREBASE_DEFAULTS.appId),
}

export const googleAuthEnabled = Boolean(cfg.apiKey && cfg.projectId && cfg.appId)
export const firebaseProjectId = cfg.projectId

let app: FirebaseApp | null = null
let auth: Auth | null = null

function ensureInit(): Auth | null {
  if (!googleAuthEnabled) return null
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp({
      apiKey: cfg.apiKey!,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId!,
      appId: cfg.appId!,
    })
    auth = getAuth(app)
  }
  return auth
}

/** True when the last popup attempt was blocked and a redirect is in flight. */
export function isRedirectSignInPending(): boolean {
  try { return new URLSearchParams(window.location.search).get('signin') === 'redirect' } catch { return false }
}

/**
 * True when this page is embedded inside another page (an iframe preview,
 * a sandboxed "arena"/demo host, etc). Both signInWithPopup AND
 * signInWithRedirect are unreliable in that context — a popup opened from
 * inside a frame is frequently blocked outright by the frame's `sandbox`
 * attribute, and even when it isn't, browsers increasingly ship default
 * Cross-Origin-Opener-Policy behaviour that stops the opener from ever
 * detecting the popup closed, so the sign-in promise never resolves OR
 * rejects — the button just spins forever. A full-page redirect fares no
 * better: if the frame's `sandbox` doesn't include `allow-top-navigation`,
 * the browser silently refuses to navigate at all. Either way, "sign in"
 * from inside a frame reliably looks exactly like this page hanging.
 */
export function isEmbeddedInFrame(): boolean {
  try { return window.self !== window.top } catch { return true } // cross-origin access throws → treat as embedded
}

const REDIRECT_MARKER_KEY = 'setu-google-redirect-inflight'

/**
 * Completes a signInWithRedirect() round-trip (after the browser comes back
 * to this page). Resolves with the Firebase ID token, or null when there is
 * no redirect result. Called once from the login page mount.
 *
 * If a redirect was started (marker set) but Firebase reports no result on
 * return, that's a SILENT FAILURE, not "nothing happened yet" — usually the
 * browser lost the auth-session storage across the round trip (a preview
 * host that serves a fresh URL/origin per load, third-party storage
 * partitioning, or private browsing). We surface that explicitly instead of
 * leaving the login page looking like it did nothing.
 */
export async function resumeRedirectSignIn(): Promise<string | null> {
  const a = ensureInit()
  if (!a) return null
  const wasInFlight = (() => { try { return sessionStorage.getItem(REDIRECT_MARKER_KEY) === '1' } catch { return false } })()
  try {
    const result = await getRedirectResult(a)
    try { sessionStorage.removeItem(REDIRECT_MARKER_KEY) } catch { /* noop */ }
    if (!result) {
      if (wasInFlight) {
        throw new Error(
          "The Google sign-in redirect came back but didn't complete. This usually means the browser couldn't carry the sign-in session across the redirect "
          + '(common in preview/sandboxed environments, private browsing, or with third-party storage blocked). '
          + 'Try opening this app in its own full browser tab, or use email + password instead.',
        )
      }
      return null
    }
    return await result.user.getIdToken()
  } catch (err) {
    const code = (err as { code?: string })?.code ?? ''
    if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
      try { sessionStorage.removeItem(REDIRECT_MARKER_KEY) } catch { /* noop */ }
      return null
    }
    throw err
  }
}

function raceWithTimeout<T>(p: Promise<T>, ms: number, onTimeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(onTimeoutMessage), { code: 'auth/popup-stuck' })), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

/**
 * Opens the Google account chooser (Firebase popup) and returns a signed
 * id_token for the signed-in user, or null when Firebase isn't configured /
 * the user cancels. Throws on a hard failure (misconfiguration, network).
 */
export async function signInWithGoogle(): Promise<string | null> {
  const a = ensureInit()
  if (!a) return null

  // Inside an iframe, don't even attempt a popup or redirect — both are
  // routinely broken by the parent frame's own sandbox restrictions, and
  // the failure mode is a hang, not a clean error. Fail fast with an
  // actionable message instead of leaving the button spinning.
  if (isEmbeddedInFrame()) {
    throw Object.assign(
      new Error('This page is embedded in a frame, which blocks Google sign-in. Open it in its own browser tab (not inside this preview) and try again, or use email + password.'),
      { code: 'auth/embedded-frame' },
    )
  }

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  let result: import('firebase/auth').UserCredential
  try {
    // A hung popup (browser-level Cross-Origin-Opener-Policy defaults can
    // stop the opener from ever detecting the popup closed) would otherwise
    // leave signInWithPopup's promise pending forever — bound it so the UI
    // always recovers instead of spinning indefinitely.
    result = await raceWithTimeout(
      signInWithPopup(a, provider),
      25_000,
      "The Google sign-in window didn't respond in time. Your browser may be blocking communication with the popup — try again, or reload the page and use email + password.",
    )
  } catch (err) {
    const code = (err as { code?: string })?.code ?? ''
    // User closed the popup — not an error, just no token.
    if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') return null
    // Popup blocked / unsupported → transparently fall back to the redirect
    // flow; the login page resumes it via resumeRedirectSignIn() on reload.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try { sessionStorage.setItem(REDIRECT_MARKER_KEY, '1') } catch { /* noop */ }
      await signInWithRedirect(a, provider)
      return null // page navigates away; the flow resumes after the redirect
    }
    throw err
  }
  // The Firebase-issued ID token is THE token this app uses — the server
  // validates its signature, issuer and audience against FIREBASE_PROJECT_ID.
  try {
    return await result.user.getIdToken()
  } catch {
    // Extremely rare (network loss mid-handshake): fall back to Google's raw
    // OAuth credential — the server verifies that flavor as well.
    return GoogleAuthProvider.credentialFromResult(result)?.idToken ?? null
  }
}
