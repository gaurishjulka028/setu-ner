// Local-mock verification for the Twilio WhatsApp path (Job 1, step 1e).
//
// Sandbox egress to api.twilio.com is blocked, so we point TWILIO_API_BASE at
// an in-process HTTP server and assert the exact request/response behaviour of
// deliverTwilio()/dispatchWhatsApp() against it.
//
// Each scenario runs in its OWN process (spawned by the parent below) because
// the module's `cfg` is captured at import time — env must be set before the
// first import, and a fresh process is the reliable way to get that per case.
//
// Run:  cd server && node_modules/.bin/tsx scripts/verify-twilio.ts
import http from 'http'
import { spawnSync } from 'child_process'
import path from 'path'
import type { AddressInfo } from 'net'

type Recorded = { path: string; auth: string; fields: Record<string, string> }

function applyCaseEnv(caseName: string) {
  process.env.WHATSAPP_PROVIDER = 'twilio'
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'
  process.env.TWILIO_AUTH_TOKEN = 'authtest'
  process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+17372508034'
  delete process.env.TWILIO_WHATSAPP_CONTENT_SID
  delete process.env.TWILIO_CONTENT_VARIABLES
  if (caseName !== '01-freeform-success' && caseName !== '03-cold-no-template' && caseName !== '07-e164-normalisation') {
    process.env.TWILIO_WHATSAPP_CONTENT_SID = 'HXtemplate'
  }
  if (caseName === '05-multislot-vars') process.env.TWILIO_CONTENT_VARIABLES = '{"1":"{{body}}","2":"SETU-NER"}'
  if (caseName === '06-malformed-vars') process.env.TWILIO_CONTENT_VARIABLES = '{not valid json'
}

async function runCase(caseName: string): Promise<number> {
  const recorded: Recorded[] = []
  let handler: (fields: Record<string, string>, reqIndex: number) => { status: number; json: unknown } =
    () => ({ status: 201, json: { sid: 'SM_OK' } })

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString()))
    req.on('end', () => {
      const fields: Record<string, string> = {}
      for (const [k, v] of new URLSearchParams(raw)) fields[k] = v
      const idx = recorded.length
      recorded.push({ path: req.url ?? '', auth: req.headers.authorization ?? '', fields })
      const { status, json } = handler(fields, idx)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as AddressInfo).port
  process.env.TWILIO_API_BASE = `http://127.0.0.1:${port}`

  // Env must be set BEFORE the import below (cfg is captured at import time).
  applyCaseEnv(caseName)
  const wa = await import('../src/lib/whatsapp')

  const expectedPath = '/2010-04-01/Accounts/ACtest/Messages.json'
  const expectBasic = 'Basic ' + Buffer.from('ACtest:authtest').toString('base64')

  let failures = 0
  const check = (name: string, cond: boolean, detail?: string) => {
    const ok = cond ? 'PASS' : 'FAIL'
    console.log(`  ${ok}  ${name}${detail ? `  [${detail}]` : ''}`)
    if (!cond) failures++
  }
  // No request may ever carry both Body and ContentSid (Twilio rejects it).
  const noBodyAndSid = () =>
    recorded.every((r) => !(r.fields.Body !== undefined && r.fields.ContentSid !== undefined))

  switch (caseName) {
    case '01-freeform-success': {
      handler = () => ({ status: 201, json: { sid: 'SM_OK' } })
      const msg = await wa.dispatchWhatsApp('918652296833', 'hello world')
      check('sent', msg.status === 'sent', `status=${msg.status}`)
      check('providerId', msg.providerId === 'SM_OK', msg.providerId)
      check('exactly one request', recorded.length === 1, `n=${recorded.length}`)
      check('correct URL', recorded[0]?.path === expectedPath, recorded[0]?.path)
      check('Basic auth', recorded[0]?.auth === expectBasic)
      check('Body only (no ContentSid/Variables)', recorded[0]?.fields.Body === 'hello world' && !('ContentSid' in recorded[0].fields) && !('ContentVariables' in recorded[0].fields))
      check('never both Body+ContentSid', noBodyAndSid())
      break
    }

    case '02-template-fallback': {
      handler = (_f, idx) => idx === 0
        ? { status: 400, json: { message: 're-engagement message required' } }
        : { status: 201, json: { sid: 'SM_TMPL' } }
      const msg = await wa.dispatchWhatsApp('918652296833', 'emergency broadcast')
      check('sent via template', msg.status === 'sent' && msg.providerId === 'SM_TMPL', JSON.stringify({ status: msg.status, sid: msg.providerId }))
      check('two requests', recorded.length === 2, `n=${recorded.length}`)
      check('1st is free-form Body', recorded[0]?.fields.Body === 'emergency broadcast' && !('ContentSid' in recorded[0].fields))
      check('2nd carries ContentSid', recorded[1]?.fields.ContentSid === 'HXtemplate', recorded[1]?.fields.ContentSid)
      const vars = recorded[1]?.fields.ContentVariables
      check('2nd carries ContentVariables {"1":body}', vars != null && JSON.parse(vars)['1'] === 'emergency broadcast', vars)
      check('never both Body+ContentSid', noBodyAndSid())
      break
    }

    case '03-cold-no-template': {
      handler = () => ({ status: 400, json: { message: 're-engagement message required' } })
      const msg = await wa.dispatchWhatsApp('918652296833', 'cold recipient')
      check('marked failed', msg.status === 'failed', `status=${msg.status}`)
      check('one request only', recorded.length === 1, `n=${recorded.length}`)
      check('error carries twilio reason', /twilio: re-engagement/.test(msg.error ?? ''), msg.error)
      check('never both Body+ContentSid', noBodyAndSid())
      break
    }

    case '04-both-refused': {
      handler = (_f, idx) => idx === 0
        ? { status: 400, json: { message: 'free-form refused' } }
        : { status: 400, json: { message: 'template refused' } }
      const msg = await wa.dispatchWhatsApp('918652296833', 'both fail')
      check('marked failed', msg.status === 'failed', `status=${msg.status}`)
      check('two requests', recorded.length === 2, `n=${recorded.length}`)
      const err = msg.error ?? ''
      check('error retains BOTH reasons', /template refused/.test(err) && /free-form refused/.test(err), err)
      check('never both Body+ContentSid', noBodyAndSid())
      break
    }

    case '05-multislot-vars': {
      handler = (_f, idx) => idx === 0
        ? { status: 400, json: { message: 're-engagement message required' } }
        : { status: 201, json: { sid: 'SM_VARS' } }
      const msg = await wa.dispatchWhatsApp('918652296833', 'situation report text')
      check('sent', msg.status === 'sent' && msg.providerId === 'SM_VARS', JSON.stringify({ status: msg.status, sid: msg.providerId }))
      const vars = recorded[1]?.fields.ContentVariables
      const parsed = vars ? JSON.parse(vars) : {}
      check('slot1 substituted', parsed['1'] === 'situation report text', JSON.stringify(parsed))
      check('slot2 literal preserved', parsed['2'] === 'SETU-NER', JSON.stringify(parsed))
      check('never both Body+ContentSid', noBodyAndSid())
      break
    }

    case '06-malformed-vars': {
      const warns: string[] = []
      const origWarn = console.warn
      console.warn = (...a: unknown[]) => { warns.push(a.join(' ')); origWarn(...a) }
      handler = (_f, idx) => idx === 0
        ? { status: 400, json: { message: 're-engagement message required' } }
        : { status: 201, json: { sid: 'SM_FALLBACK' } }
      const msg = await wa.dispatchWhatsApp('918652296833', 'body text')
      console.warn = origWarn
      check('sent via safe default', msg.status === 'sent' && msg.providerId === 'SM_FALLBACK', JSON.stringify({ status: msg.status, sid: msg.providerId }))
      check('warned about malformed JSON', warns.some((w) => w.includes('not valid JSON')), warns.join(' | '))
      const vars = recorded[1]?.fields.ContentVariables
      check('safe default {"1":body}', vars != null && JSON.parse(vars)['1'] === 'body text' && Object.keys(JSON.parse(vars)).length === 1, vars)
      check('never both Body+ContentSid', noBodyAndSid())
      break
    }

    case '07-e164-normalisation': {
      const { normalizeWaNumber } = wa
      const inputs = ['8652296833', '08652296833', '918652296833', '+91 86522 96833', 'whatsapp:+918652296833']
      let ok = true
      const got: Record<string, string> = {}
      for (const input of inputs) {
        const n = normalizeWaNumber(input)
        got[input] = n
        if (n !== '918652296833') ok = false
      }
      check('all normalise to 918652296833', ok, JSON.stringify(got))
      recorded.length = 0
      handler = () => ({ status: 201, json: { sid: 'SM_E164' } })
      await wa.dispatchWhatsApp('+91 86522 96833', 'to field')
      check('wire To = whatsapp:+918652296833', recorded[0]?.fields.To === 'whatsapp:+918652296833', recorded[0]?.fields.To)
      break
    }

    default:
      throw new Error(`unknown case: ${caseName}`)
  }

  server.close()
  return failures
}

const CASES = [
  '01-freeform-success',
  '02-template-fallback',
  '03-cold-no-template',
  '04-both-refused',
  '05-multislot-vars',
  '06-malformed-vars',
  '07-e164-normalisation',
]

async function main() {
  const script = path.resolve(__filename)
  const tsx = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')
  let totalFailures = 0

  if (process.env.VERIFY_CASE) {
    console.log(`\n== ${process.env.VERIFY_CASE} ==`)
    const n = await runCase(process.env.VERIFY_CASE)
    process.exitCode = n
    return
  }

  for (const c of CASES) {
    const r = spawnSync(process.execPath, [tsx, script], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, VERIFY_CASE: c },
      stdio: 'inherit',
    })
    if (r.status !== 0) totalFailures++
  }

  console.log(`\n${totalFailures === 0 ? 'ALL SCENARIOS PASSED' : `${totalFailures} SCENARIO(S) FAILED`}`)
  process.exitCode = totalFailures === 0 ? 0 : 1
}

main()
