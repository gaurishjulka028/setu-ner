// Local-mock verification for the Gemini disaster-analysis engine (Job 2).
//
// Sandbox egress to generativelanguage.googleapis.com is blocked, so we point
// ANALYSIS_BASE_URL at an in-process HTTP server and assert the exact
// request/response behaviour of getSituationReport():
//   1. the Gemini request carries responseMimeType + responseSchema and a
//      compact district-level prompt (no raw vehicle/segment dumps);
//   2. a well-formed JSON response validates and normalises (unknown
//      district ids dropped, canonical name/state attached), live:true;
//   3. a malformed response is rejected → deterministic fallback, live:false;
//   4. no VISION_API_KEY → deterministic fallback, live:false with reason;
//   5. ANALYSIS_ENABLED=false → deterministic fallback, live:false.
//
// Unlike the Twilio module, analysis.ts reads its env at CALL time, so a
// single process can exercise every path without re-importing.
//
// Run:  cd server && node_modules/.bin/tsx scripts/verify-analysis.ts
import http from 'http'
import type { AddressInfo } from 'net'

async function main() {
  let failures = 0
  const check = (name: string, cond: boolean, detail?: string) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
    if (!cond) failures++
  }

  const bodies: string[] = []
  let respond: () => { status: number; json: unknown } = () => ({ status: 200, json: {} })

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString()))
    req.on('end', () => {
      bodies.push(raw)
      const { status, json } = respond()
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  // Kill any cached upstream data + force deterministic local inputs:
  process.env.ANALYSIS_BASE_URL = base
  process.env.GOVT_ALERTS_DISABLED = 'true' // NDMA SACHET host is unreachable; use fixture
  delete process.env.ANALYSIS_ENABLED
  delete process.env.ANALYSIS_MODEL

  const { getSituationReport, analysisStatus } = await import('../src/engine/analysis')

  const wellFormed = {
    severity: 'high',
    summary: 'Heavy monsoon disruption across the Barak valley and Dima Hasao hills.',
    affectedDistricts: [
      { districtId: 'HFL', severity: 'critical', note: 'Major landslide blocked NH-54 to Silchar' },
      { districtId: 'XX9', severity: 'high', note: 'hallucinated id — must be dropped' },
      { districtId: 'SIL', severity: 'moderate', note: 'flooding on approach roads' },
    ],
    recommendedActions: ['Hold freight on NH-54; route via alternates', 'Pre-position stock in Dima Hasao'],
  }

  // ── 1. well-formed response → live:true + validation + normalisation ─────
  respond = () => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(wellFormed) }] } }] } })
  process.env.VISION_API_KEY = 'mock-vision-api-key'
  const live = await getSituationReport(true)
  check('1. live:true', live.live === true, `live=${live.live}`)
  check('1. model recorded', typeof live.model === 'string' && live.model.length > 0, live.model ?? 'null')
  check('1. severity passes through', live.severity === 'high', live.severity)
  check('1. summary passes through', live.summary === wellFormed.summary)
  check('1. actions pass through', live.recommendedActions.length === 2, JSON.stringify(live.recommendedActions))
  check('1. unknown district id dropped', live.affectedDistricts.length === 2, JSON.stringify(live.affectedDistricts.map(d => d.districtId)))
  const hfl = live.affectedDistricts.find(d => d.districtId === 'HFL')
  check('1. canonical name/state attached', hfl?.name === 'Dima Hasao' && hfl?.state === 'Assam', `${hfl?.name} / ${hfl?.state}`)
  check('1. district severity kept', hfl?.severity === 'critical', hfl?.severity)

  // ── request-shape assertions on the captured body ────────────────────────
  const req = JSON.parse(bodies[bodies.length - 1])
  check('2. url shape', (bodies.length > 0), 'captured request')
  const gc = req.generationConfig ?? {}
  check('2. responseMimeType=application/json', gc.responseMimeType === 'application/json', gc.responseMimeType)
  check('2. responseSchema present + required', gc.responseSchema?.type === 'OBJECT' && Array.isArray(gc.responseSchema?.required) && gc.responseSchema.required.includes('severity'), JSON.stringify(gc.responseSchema?.required))
  const prompt: string = req.contents?.[0]?.parts?.[0]?.text ?? ''
  check('2. prompt has region rollup', prompt.includes('"region"'), 'region key present')
  check('2. prompt has district rollup fields', prompt.includes('"blockedRoads"') && prompt.includes('"govtAlerts"') && prompt.includes('"maxRisk"'), 'rollup fields')
  check('2. prompt does NOT dump raw vehicles', !prompt.includes('"driver"') && !prompt.includes('"trail"'), 'no driver/trail keys')
  check('2. prompt does NOT dump raw segments', !prompt.includes('"coords"') && !prompt.includes('"failureHistory"'), 'no coords/failureHistory keys')

  // ── 3. malformed response → fallback, live:false, reason retained ────────
  respond = () => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: '{"severity":"catastrophic"}' }] } }] } })
  const malformed = await getSituationReport(true)
  check('3. live:false', malformed.live === false, `live=${malformed.live}`)
  check('3. reason mentions gemini unavailable', /gemini unavailable/.test(malformed.reason ?? ''), malformed.reason ?? '')
  check('3. still has a severity', ['low', 'moderate', 'high', 'critical'].includes(malformed.severity), malformed.severity)
  check('3. still has actions', Array.isArray(malformed.recommendedActions) && malformed.recommendedActions.length > 0)

  // ── 4. no API key → fallback with explicit reason ────────────────────────
  delete process.env.VISION_API_KEY
  bodies.length = 0
  const nokey = await getSituationReport(true)
  check('4. live:false', nokey.live === false, `live=${nokey.live}`)
  check('4. reason = no key', /no VISION_API_KEY/.test(nokey.reason ?? ''), nokey.reason ?? '')
  check('4. model null', nokey.model === null)
  check('4. deterministic summary non-empty', nokey.summary.length > 0)
  check('4. deterministic affectedDistricts non-empty', nokey.affectedDistricts.length > 0, `n=${nokey.affectedDistricts.length}`)
  check('4. NO network call made', bodies.length === 0, `requests=${bodies.length}`)

  // ── 5. ANALYSIS_ENABLED=false → fallback without touching the network ────
  process.env.VISION_API_KEY = 'mock-vision-api-key'
  process.env.ANALYSIS_ENABLED = 'false'
  bodies.length = 0
  const disabled = await getSituationReport(true)
  check('5. live:false', disabled.live === false, `live=${disabled.live}`)
  check('5. reason = disabled', /disabled/.test(disabled.reason ?? ''), disabled.reason ?? '')
  check('5. NO network call made', bodies.length === 0, `requests=${bodies.length}`)

  // ── 6. ANALYSIS_PROVIDER=openai → OpenAI-compatible chat path ────────────
  delete process.env.ANALYSIS_ENABLED
  process.env.ANALYSIS_PROVIDER = 'openai'
  process.env.VISION_API_KEY = 'gsk_mock_key'
  process.env.ANALYSIS_MODEL = 'llama-3.3-70b-versatile'
  // Respond in the chat-completions shape, with a ```json fence to prove we
  // strip it (vision.ts-style tolerant parsing).
  respond = () => ({ status: 200, json: { choices: [{ message: { content: '```json\n' + JSON.stringify(wellFormed) + '\n```' } }] } })
  bodies.length = 0
  const viaOpenAI = await getSituationReport(true)
  check('6. live:true via openai provider', viaOpenAI.live === true, `live=${viaOpenAI.live}`)
  check('6. model recorded with provider', /^openai:/.test(viaOpenAI.model ?? ''), viaOpenAI.model ?? 'null')
  check('6. severity/summary parsed', viaOpenAI.severity === 'high' && viaOpenAI.summary === wellFormed.summary)
  check('6. district normalisation applied', viaOpenAI.affectedDistricts.length === 2, JSON.stringify(viaOpenAI.affectedDistricts.map(d => d.districtId)))
  const openaiReq = JSON.parse(bodies[bodies.length - 1])
  check('6. posted to /chat/completions with Bearer auth', bodies.length === 1, `requests=${bodies.length}`)
  check('6. messages role structure', Array.isArray(openaiReq.messages) && openaiReq.messages.some((m: any) => m.role === 'user'), JSON.stringify(openaiReq.messages?.map((m: any) => m.role)))

  console.log(`\nstatus(): ${JSON.stringify(analysisStatus())}`)
  server.close()
  console.log(`\n${failures === 0 ? 'ALL ANALYSIS CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
