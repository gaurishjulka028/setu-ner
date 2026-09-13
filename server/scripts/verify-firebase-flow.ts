// ── Verification: the Firebase/Google identity-token path (lib/identity.ts) ─
//
// Runs the FULL verification logic end-to-end against a LOCAL stub JWKS —
// no real Google account, no network needed:
//
//   1. generate an RSA keypair, serve its public JWK at a stub JWKS URL
//   2. sign a FIREBASE-shaped token (iss https://securetoken.google.com/<pid>,
//      aud <pid>) → verifyIdentityToken must accept it
//   3. same shape but aud = ANOTHER project → must be REJECTED (the "proper
//      Firebase" guarantee: tokens from other projects don't pass)
//   4. GOOGLE-OIDC-shaped token (iss accounts.google.com) → accepted
//   5. expired token → rejected
//   6. garbage token → rejected with a human-readable error
//
// Usage: npx tsx scripts/verify-firebase-flow.ts
import 'dotenv/config'
import http from 'http'
import { generateKeyPair, exportJWK, exportPKCS8, importPKCS8, SignJWT, type KeyLike } from 'jose'

const PROJECT = 'new-project-6e761'
const PORT = 4567

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

async function main() {
  // 1. keypair + JWKS stub serving the public key
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key-1', alg: 'RS256', use: 'sig' }
  const priv = await importPKCS8(await exportPKCS8(privateKey as KeyLike), 'RS256')

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ keys: [jwk] }))
  })
  await new Promise<void>(res => server.listen(PORT, () => res()))
  const jwksUrl = `http://localhost:${PORT}/jwks`

  // Point the verifier at the stub (same env convention as TWILIO_API_BASE).
  process.env.FIREBASE_JWKS_URL = jwksUrl
  process.env.GOOGLE_OIDC_JWKS_URL = jwksUrl
  process.env.FIREBASE_PROJECT_ID = PROJECT
  const { verifyIdentityToken } = await import('../src/lib/identity')

  const sign = async (payload: Record<string, unknown>) =>
    new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' }).sign(priv)

  // 2. Firebase-shaped token → accepted
  const goodFirebase = await sign({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'fb-uid-123',
    user_id: 'fb-uid-123',
    email: 'officer@mdoner.gov.in',
    email_verified: true,
    name: 'Test Officer',
    firebase: { sign_in_provider: 'google.com', identities: {} },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  try {
    const id = await verifyIdentityToken(goodFirebase)
    check('Firebase token accepted', id.via === 'firebase' && id.sub === 'fb-uid-123' && id.email === 'officer@mdoner.gov.in', `via=${id.via} sub=${id.sub} email=${id.email}`)
  } catch (e) { check('Firebase token accepted', false, String((e as Error).message)) }

  // 3. Firebase token for a DIFFERENT project → rejected
  const foreignProject = await sign({
    iss: 'https://securetoken.google.com/someone-elses-project',
    aud: 'someone-elses-project',
    sub: 'fb-uid-999', email: 'attacker@example.com', email_verified: true,
    firebase: { sign_in_provider: 'google.com', identities: {} },
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  })
  try {
    await verifyIdentityToken(foreignProject)
    check('Foreign-project Firebase token rejected', false, 'was accepted!')
  } catch (e) {
    check('Foreign-project Firebase token rejected', /different Firebase project|audience|issuer/i.test((e as Error).message), String((e as Error).message).slice(0, 100))
  }

  // 4. Google-OIDC-shaped token → accepted
  const googleOidc = await sign({
    iss: 'https://accounts.google.com',
    aud: '1:695935356647:web:c92b327ff8d0b69393dc42',
    sub: 'google-sub-42', email: 'citizen@gmail.com', email_verified: true, name: 'Test Citizen',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  })
  try {
    const id = await verifyIdentityToken(googleOidc)
    check('Google OIDC token accepted', id.via === 'google' && id.sub === 'google-sub-42', `via=${id.via}`)
  } catch (e) { check('Google OIDC token accepted', false, String((e as Error).message)) }

  // 5. expired token → rejected
  const expired = await sign({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'x',
    email: 'a@b.c', firebase: { sign_in_provider: 'google.com', identities: {} },
    iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600,
  })
  try {
    await verifyIdentityToken(expired)
    check('Expired token rejected', false, 'was accepted!')
  } catch (e) { check('Expired token rejected', true, String((e as Error).message).slice(0, 80)) }

  // 6. garbage → rejected, human-readable
  try {
    await verifyIdentityToken('not-a-jwt')
    check('Garbage token rejected', false, 'was accepted!')
  } catch (e) { check('Garbage token rejected', /malformed/i.test((e as Error).message), String((e as Error).message).slice(0, 90)) }

  server.close()
  if (failures) { console.error(`\n${failures} check(s) FAILED`); process.exit(1) }
  console.log('\nAll identity-token checks passed.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
