// Verification for the auth surface (Google sign-in + phone OTP), in the
// same style as verify-twilio.ts: a stub Google tokeninfo endpoint stands in
// for oauth2.googleapis.com (sandbox egress is blocked), OTP runs on the
// simulated channel (code echoed back as devCode), and a throwaway SQLite DB
// keeps test users out of dev.db.
//
// Run:  cd server && node_modules/.bin/tsx scripts/verify-google-auth.ts
import http from 'http'
import type { AddressInfo } from 'net'
import fs from 'fs'
import path from 'path'

let failures = 0
const pass = (name: string, cond: boolean, detail?: string) => {
  if (!cond) failures++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail != null ? `  [${detail}]` : ''}`)
}

// ── Stub Google tokeninfo ────────────────────────────────────────────────
// Maps the (fake) id_token to an identity, the way Google would.
const stubIdentities: Record<string, Record<string, unknown>> = {}
const stub = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const tok = url.searchParams.get('id_token') ?? ''
  res.setHeader('Content-Type', 'application/json')
  const extra = Object.keys(stubIdentities).find(prefix => tok.startsWith(prefix))
  if (extra) {
    res.end(JSON.stringify(stubIdentities[extra]))
  } else if (tok.startsWith('tok-gov-')) {
    res.end(JSON.stringify({ sub: 'gsub-gov-1', email: 'dc@assam.gov.in', email_verified: 'true', name: 'DC Assam' }))
  } else if (tok.startsWith('tok-gmail-')) {
    res.end(JSON.stringify({ sub: 'gsub-gmail-1', email: 'person@gmail.com', email_verified: true, name: 'Person One' }))
  } else if (tok.startsWith('tok-unverified-')) {
    res.end(JSON.stringify({ sub: 'gsub-uv', email: 'x@gmail.com', email_verified: false }))
  } else {
    res.writeHead(400)
    res.end(JSON.stringify({ error_description: 'Invalid token' }))
  }
})

async function main() {
  await new Promise<void>(r => stub.listen(0, '127.0.0.1', () => r()))
  const stubPort = (stub.address() as AddressInfo).port

  // Env MUST be set before the dynamic imports below (cfg captured at import).
  process.env.GOOGLE_TOKENINFO_URL = `http://127.0.0.1:${stubPort}/tokeninfo`
  process.env.JWT_SECRET = 'verify-secret'
  process.env.JWT_EXPIRES_IN = '8h'
  process.env.OTP_CHANNEL = 'simulated'
  delete process.env.NODE_ENV
  const dbName = `verify-auth-${Date.now()}.db`
  process.env.DATABASE_URL = `file:./${dbName}`

  const { prisma } = await import('../src/prisma')
  const { default: authRouter } = await import('../src/routes/auth')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
      "role" TEXT NOT NULL, "org" TEXT NOT NULL, "districtId" TEXT NOT NULL,
      "points" INTEGER, "badges" TEXT, "passwordHash" TEXT, "phone" TEXT,
      "authProvider" TEXT NOT NULL DEFAULT 'password', "googleSub" TEXT, "phoneVerifiedAt" REAL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
    CREATE UNIQUE INDEX IF NOT EXISTS "users_googleSub_key" ON "users"("googleSub");
  `)

  const { default: express } = await import('express')
  const app = express()
  app.use(express.json())
  app.use(authRouter)
  const srv = app.listen(0, '127.0.0.1')
  await new Promise<void>(r => srv.once('listening', () => r()))
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`

  const post = async (p: string, body: unknown) => {
    const res = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  console.log('== registration is Google + OTP only ==')
  let r = await post('/register', { name: 'Anima', email: 'anima@example.com', password: 'secret1', role: 'citizen', phone: '98652 96833' })
  pass('email/password register removed (410)', r.status === 410, `status=${r.status}`)

  console.log('== phone OTP ==')
  r = await post('/otp/send', { phone: '12345' })
  pass('bad phone rejected (400)', r.status === 400, r.body.error as string)
  r = await post('/otp/send', { phone: '98652 96833' })
  pass('otp sent (200, simulated channel)', r.status === 200 && r.body.channel === 'simulated', `status=${r.status} channel=${r.body.channel}`)
  const devCode = r.body.devCode as string | undefined
  pass('dev code echoed outside production', typeof devCode === 'string' && devCode.length === 6, devCode)
  r = await post('/otp/send', { phone: '98652 96833' })
  pass('resend inside cooldown blocked (429)', r.status === 429, `status=${r.status}`)
  r = await post('/otp/verify', { phone: '98652 96833', code: '000000' })
  pass('wrong code rejected (400)', r.status === 400 || devCode === '000000', r.body.error as string)
  r = await post('/otp/verify', { phone: '98652 96833', code: devCode })
  pass('correct code → phoneToken', r.status === 200 && typeof r.body.phoneToken === 'string', `status=${r.status}`)
  const phoneToken = r.body.phoneToken as string
  r = await post('/otp/verify', { phone: '98652 96833', code: devCode })
  pass('code is single-use (400)', r.status === 400, `status=${r.status}`)

  console.log('== google sign-in ==')
  r = await post('/google', { idToken: 'tok-gov-abc' })
  pass('new account without phone proof → needsPhone (400)', r.status === 400 && r.body.needsPhone === true, `status=${r.status}`)
  pass('role hinted as official for gov email', r.body.role === 'official', r.body.role as string)

  r = await post('/google', { idToken: 'tok-gov-abc', phoneToken: 'garbage' })
  pass('forged phoneToken rejected (400 needsPhone)', r.status === 400 && r.body.needsPhone === true, `status=${r.status}`)

  r = await post('/google', { idToken: 'tok-gov-abc', phoneToken })
  pass('gov google user created as official (201)', r.status === 201, `status=${r.status}`)
  pass('phone stored in E.164 from OTP proof', r.body.user?.phone === '919865296833', r.body.user?.phone)
  pass('phoneVerifiedAt set', typeof r.body.user?.phoneVerifiedAt === 'number')
  pass('authProvider google', r.body.user?.authProvider === 'google')
  pass('server-only fields stripped', r.body.user && !('passwordHash' in r.body.user) && !('googleSub' in r.body.user))
  const govToken = r.body.token as string

  r = await post('/google', { idToken: 'tok-gov-abc' })
  pass('second google sign-in → plain login (200), no OTP again', r.status === 200, `status=${r.status}`)

  // OTP proof for a second number, used for the gmail account
  r = await post('/otp/send', { phone: '9865296841' })
  const code2 = r.body.devCode as string
  r = await post('/otp/verify', { phone: '9865296841', code: code2 })
  const phoneToken2 = r.body.phoneToken as string
  r = await post('/google', { idToken: 'tok-gmail-abc', phoneToken: phoneToken2 })
  pass('gmail google user created as citizen (201)', r.status === 201, `status=${r.status}`)
  pass('role is citizen', r.body.user?.role === 'citizen', r.body.user?.role)

  r = await post('/google', { idToken: 'tok-unverified-abc', phoneToken: phoneToken2 })
  pass('unverified email rejected (401)', r.status === 401, `status=${r.status}`)

  r = await post('/google', { idToken: 'tok-invalid-xyz', phoneToken: phoneToken2 })
  pass('invalid token rejected (401)', r.status === 401, `status=${r.status}`)

  r = await post('/login', { email: 'dc@assam.gov.in', password: 'whatever' })
  pass('google-only account cannot password-login (400)', r.status === 400, r.body.error as string)

  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${govToken}` } })
  pass('/me works with issued JWT', me.status === 200, `status=${me.status}`)

  // Legacy account (pre-OTP, no phoneVerifiedAt) must verify once on next login
  await prisma.$executeRawUnsafe(`INSERT INTO users (id,email,name,role,org,districtId,authProvider,googleSub,phone) VALUES ('u-legacy','legacy@gmail.com','Legacy','citizen','Public','GHY','google','gsub-legacy','919800000000')`)
  stubIdentities['tok-legacy-'] = { sub: 'gsub-legacy', email: 'legacy@gmail.com', email_verified: true, name: 'Legacy' }
  r = await post('/google', { idToken: 'tok-legacy-1' })
  pass('legacy account asked to verify phone once', r.status === 400 && r.body.needsPhone === true && r.body.knownPhone === '919800000000', `status=${r.status}`)
  r = await post('/otp/send', { phone: '9800000000' })
  r = await post('/otp/verify', { phone: '9800000000', code: r.body.devCode })
  r = await post('/google', { idToken: 'tok-legacy-1', phoneToken: r.body.phoneToken })
  pass('legacy account signed in after OTP (200)', r.status === 200 && typeof r.body.user?.phoneVerifiedAt === 'number', `status=${r.status}`)

  srv.close()
  stub.close()
  await prisma.$disconnect()
  // tidy the throwaway DB (resolveDatabaseUrl resolves file:./ under prisma/)
  for (const f of [path.resolve(__dirname, '..', 'prisma', dbName)]) {
    try { fs.rmSync(f, { force: true }) } catch { /* noop */ }
  }

  console.log(failures === 0 ? '\nALL AUTH CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('Verification crashed:', e)
  process.exit(1)
})
