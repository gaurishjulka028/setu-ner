// ── Gemini disaster-analysis engine ────────────────────────────────────────
//
// Fuses the region's live signals — NDMA SACHET government alerts, Open-Meteo
// weather, blocked/cut-off corridors, at-risk fleet, per-segment risk scores
// and district stock gaps — into one structured situation report: an overall
// severity, the affected districts and recommended actions.
//
// The AI call mirrors lib/vision.ts's callGemini() (POST
// {base}/v1beta/models/{model}:generateContent?key=...), but requests
// structured output via responseMimeType + responseSchema so the shape is
// enforced by the API, then validates it with zod as a second layer.
// ANALYSIS_PROVIDER=openai switches to any OpenAI-compatible chat endpoint
// (Groq free tier, OpenRouter free models, local Ollama…) for the same job,
// so the integration works without Gemini billing. In either case a
// network/parse/schema failure degrades to the deterministic summary below.
//
// Consistent with the repo's "degrade, don't fail closed" philosophy (see the
// heuristic fallback in vision.ts and the Stadia→OSRM chain): with
// ANALYSIS_ENABLED=false, no VISION_API_KEY, or any network/parse/schema
// failure, we fall back to a deterministic summary computed locally from the
// SAME inputs, marked live:false with the reason. This module never throws
// into a request handler.
import { z } from 'zod'
import type { Season, WeatherPoint } from '../data/types'
import { DISTRICTS, SEGMENTS } from '../data/ner'
import { prisma } from '../prisma'
import { getGovtAlerts } from '../integrations/govtAlerts'
import { getRegionWeather, weatherStatus } from './weather'
import { getVehicles, liveVehicleIds } from './vehicles'
import { riskOf, liveCongestionCounts, rainAt, currentSegmentId, type RiskBreakdown } from './risk'

// ── Public shape ───────────────────────────────────────────────────────────
export type SituationSeverity = 'low' | 'moderate' | 'high' | 'critical'

export interface AffectedDistrict {
  districtId: string
  name: string
  state: string
  severity: SituationSeverity
  note: string
}

export interface SituationReport {
  severity: SituationSeverity
  summary: string
  affectedDistricts: AffectedDistrict[]
  recommendedActions: string[]
  live: boolean
  generatedAt: string
  /** Model that produced the report (null when the deterministic fallback ran). */
  model: string | null
  /** Why live:false (disabled / no key / error), else null. */
  reason: string | null
}

// ── Config ─────────────────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000 // matches weather.ts CACHE_TTL_MS

export type AnalysisProvider = 'gemini' | 'openai'
// ANALYSIS_PROVIDER=openai targets any OpenAI-compatible chat endpoint (same
// convention as vision.ts's openai provider): Groq free tier, OpenRouter
// free models, a local Ollama/LM Studio, etc. — no Gemini billing required.
// ANALYSIS_PROVIDER accepts the same names as VISION_PROVIDER — "groq",
// "openrouter", "ollama" and "openai" are all the OpenAI-compatible path with
// a preset base URL / model; "gemini" is Google's API. When ANALYSIS_PROVIDER
// is unset it follows VISION_PROVIDER, so one free Groq key configures both
// the photo analyser and the situation-report analyser.
const OPENAI_COMPAT_PRESETS: Record<string, { baseUrl: string; model: string; needsKey: boolean }> = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', needsKey: true },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-20b:free', needsKey: true },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1', needsKey: false },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
}
const rawProvider = () => (process.env.ANALYSIS_PROVIDER || process.env.VISION_PROVIDER || 'gemini').toLowerCase().trim()
const compatPreset = () => OPENAI_COMPAT_PRESETS[rawProvider()]
const providerName = (): AnalysisProvider => (compatPreset() ? 'openai' : 'gemini')
/** The configured vendor name ("groq", "gemini", …) for status output. */
const vendorName = () => (compatPreset() ? rawProvider() : 'gemini')

const analysisEnabled = () => process.env.ANALYSIS_ENABLED !== 'false'
// Ollama needs no key; every hosted provider does.
const apiKey = () => (process.env.VISION_API_KEY ?? '').trim() || (compatPreset() && !compatPreset().needsKey ? 'local' : undefined)
const currentModel = () => {
  if (process.env.ANALYSIS_MODEL) return process.env.ANALYSIS_MODEL
  const preset = compatPreset()
  if (preset) return preset.model
  return process.env.VISION_MODEL || 'gemini-2.5-flash'
}
const geminiBase = () =>
  (process.env.ANALYSIS_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
const openaiBase = () =>
  (process.env.ANALYSIS_BASE_URL || process.env.VISION_BASE_URL || compatPreset()?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')

// ── Zod schema: the exact shape we demand back from Gemini ─────────────────
const affectedDistrictSchema = z.object({
  districtId: z.string().min(2).max(8),
  severity: z.enum(['low', 'moderate', 'high', 'critical']),
  note: z.string().max(300),
})

const geminiReportSchema = z.object({
  severity: z.enum(['low', 'moderate', 'high', 'critical']),
  summary: z.string().min(1).max(1200),
  affectedDistricts: z.array(affectedDistrictSchema).max(38),
  recommendedActions: z.array(z.string().max(300)).max(12),
})

// responseSchema for Gemini structured output (OpenAPI-subset, UPPERCASE types).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    severity: { type: 'STRING', enum: ['low', 'moderate', 'high', 'critical'] },
    summary: { type: 'STRING' },
    affectedDistricts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          districtId: { type: 'STRING' },
          severity: { type: 'STRING', enum: ['low', 'moderate', 'high', 'critical'] },
          note: { type: 'STRING' },
        },
        required: ['districtId', 'severity', 'note'],
      },
    },
    recommendedActions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['severity', 'summary', 'affectedDistricts', 'recommendedActions'],
}

// ── Evidence assembly (district-level summary, NOT raw arrays) ─────────────
interface DistrictEvidence {
  id: string
  name: string
  state: string
  govtAlerts: number
  govtMaxSeverity: 'high' | 'medium' | 'low' | null
  blockedRoads: number
  cautionRoads: number
  maxRisk: number
  rainMm: number
  haltedVehicles: number
  delayedVehicles: number
  minStockDays: number | null
}

interface Evidence {
  region: {
    govt: { live: boolean; count: number; high: number; medium: number; low: number }
    weather: { live: boolean; wettest: { name: string; rainMm: number }[] }
    roads: { blocked: number; caution: number }
    fleet: { total: number; gps: number; halted: number; delayed: number; moving: number }
    stock: { criticalDistricts: number }
  }
  districts: DistrictEvidence[]
}

const segById = new Map(SEGMENTS.map(s => [s.id, s]))

// A district is only "affected" on a *meaningful* signal — a blocked corridor,
// an official high/medium alert, a halted convoy, ≤3 days of stock, a very
// high-risk stretch (>=60) or very heavy rain (>=20 mm/h). A lone caution
// corridor, a low-severity state-wide watch or light rain doesn't qualify, so
// the report (and the prompt) stay focused instead of listing every district.
const hasSignal = (d: DistrictEvidence) =>
  d.blockedRoads > 0 ||
  d.govtMaxSeverity === 'high' || d.govtMaxSeverity === 'medium' ||
  d.maxRisk >= 60 ||
  d.rainMm >= 20 ||
  d.haltedVehicles > 0 ||
  (d.minStockDays !== null && d.minStockDays <= 3)

async function assembleEvidence(): Promise<Evidence> {
  const [govt, weather, stockRows] = await Promise.all([
    getGovtAlerts().catch(() => ({ alerts: [] as GovtAlertLike[], live: false, fetchedAt: 0, source: 'unavailable' })),
    getRegionWeather().catch(() => ({} as Record<string, WeatherPoint>)),
    prisma.stockLevels.findMany().catch(() => [] as { districtId: string; medicine: number; food: number; fuel: number; construction: number }[]),
  ])

  const vehicles = getVehicles()
  const liveIds = new Set(liveVehicleIds())
  const congestion = liveCongestionCounts()
  const season: Season = 'monsoon' // the alert engine's standing assumption

  // Per-segment risk, computed once (never dumped raw into the prompt).
  const segRisk = new Map<string, RiskBreakdown>()
  for (const seg of SEGMENTS) segRisk.set(seg.id, riskOf(seg, weather, season, congestion))

  // Government alerts → per district (count + max severity).
  const govtByDistrict = new Map<string, { count: number; max: 'high' | 'medium' | 'low' }>()
  for (const a of govt.alerts) {
    for (const id of a.districtIds) {
      const cur = govtByDistrict.get(id) ?? { count: 0, max: 'low' as 'high' | 'medium' | 'low' }
      cur.count++
      if (a.severity === 'high' || (a.severity === 'medium' && cur.max === 'low')) cur.max = a.severity
      govtByDistrict.set(id, cur)
    }
  }

  // Fleet → district of the segment each vehicle currently occupies.
  const fleetByDistrict = new Map<string, { halted: number; delayed: number }>()
  for (const v of vehicles) {
    const seg = v.path.length ? segById.get(currentSegmentId(v) ?? '') : undefined
    if (!seg) continue
    const cur = fleetByDistrict.get(seg.districtId) ?? { halted: 0, delayed: 0 }
    if (v.status === 'halted') cur.halted++
    else if (v.status === 'delayed') cur.delayed++
    fleetByDistrict.set(seg.districtId, cur)
  }

  const stockByDistrict = new Map(stockRows.map(s => [s.districtId, s]))

  const districts: DistrictEvidence[] = DISTRICTS.map(d => {
    const mine = SEGMENTS.filter(s => s.districtId === d.id)
    const blockedRoads = mine.filter(s => segRisk.get(s.id)!.status === 'blocked').length
    const cautionRoads = mine.filter(s => segRisk.get(s.id)!.status === 'caution').length
    const maxRisk = mine.reduce((m, s) => Math.max(m, segRisk.get(s.id)!.total), 0)
    const g = govtByDistrict.get(d.id)
    const f = fleetByDistrict.get(d.id) ?? { halted: 0, delayed: 0 }
    const st = stockByDistrict.get(d.id)
    const minStockDays = st ? Math.min(st.medicine, st.food, st.fuel, st.construction) : null
    return {
      id: d.id,
      name: d.name,
      state: d.state,
      govtAlerts: g?.count ?? 0,
      govtMaxSeverity: g?.max ?? null,
      blockedRoads,
      cautionRoads,
      maxRisk,
      rainMm: Math.round(rainAt(d.lat, d.lng, weather) * 10) / 10,
      haltedVehicles: f.halted,
      delayedVehicles: f.delayed,
      minStockDays,
    }
  })

  const wettest = Object.values(weather)
    .sort((a, b) => b.rainNow - a.rainNow)
    .slice(0, 5)
    .map(w => ({ name: w.name, rainMm: Math.round(w.rainNow * 10) / 10 }))

  return {
    region: {
      govt: {
        live: govt.live,
        count: govt.alerts.length,
        high: govt.alerts.filter(a => a.severity === 'high').length,
        medium: govt.alerts.filter(a => a.severity === 'medium').length,
        low: govt.alerts.filter(a => a.severity === 'low').length,
      },
      weather: { live: weatherStatus().live, wettest },
      roads: {
        blocked: districts.filter(d => d.blockedRoads > 0).length,
        caution: districts.filter(d => d.cautionRoads > 0).length,
      },
      fleet: {
        total: vehicles.length,
        gps: liveIds.size,
        halted: vehicles.filter(v => v.status === 'halted').length,
        delayed: vehicles.filter(v => v.status === 'delayed').length,
        moving: vehicles.filter(v => v.status === 'moving').length,
      },
      stock: { criticalDistricts: districts.filter(d => d.minStockDays !== null && d.minStockDays <= 3).length },
    },
    districts,
  }
}

// Minimal structural stand-in for the govt-alert rows we consume.
interface GovtAlertLike {
  districtIds: string[]
  severity: 'high' | 'medium' | 'low'
  event: string
  headline: string
  source: string
  live: boolean
}

// ── Gemini call ────────────────────────────────────────────────────────────
function buildPrompt(e: Evidence): string {
  const payload = { region: e.region, districts: e.districts.filter(hasSignal) }
  return `You are SETU-NER's disaster-analysis engine for a logistics coordination platform across North East India (Assam, Meghalaya, Manipur, Mizoram, Nagaland, Tripura, Arunachal Pradesh, Sikkim).

Given the compact, district-level situation summary below (compiled from live government alerts, weather, road-blockage, fleet and stock data), produce a structured situation report.

Rules:
- "severity" is the OVERALL region severity: "low" | "moderate" | "high" | "critical".
- "affectedDistricts": ONLY districts with an actual problem. Each entry has "districtId" (use the exact id from the evidence), "severity" for that district, and a one-line "note" (<= 20 words) grounded in the evidence.
- "recommendedActions": 3-6 concrete, ordered actions for the control room (routing, convoys, stock, evacuation). Ground them in the evidence.
- Do not invent facts; if a district has no signal, leave it out.

Evidence (JSON):
${JSON.stringify(payload)}`
}

async function callGeminiAnalysis(e: Evidence): Promise<{ severity: SituationSeverity; summary: string; affectedDistricts: AffectedDistrict[]; recommendedActions: string[] }> {
  const model = currentModel()
  const key = apiKey()
  if (!key) throw new Error('no VISION_API_KEY configured')
  const url = `${geminiBase()}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(e) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`analysis provider ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
  const parsed = geminiReportSchema.parse(JSON.parse(text))
  return {
    severity: parsed.severity,
    summary: parsed.summary,
    affectedDistricts: normalizeDistricts(parsed.affectedDistricts),
    recommendedActions: parsed.recommendedActions.map(a => a.trim()).filter(Boolean),
  }
}

// Cross-reference model output against the known DISTRICTS: drop unknown /
// hallucinated ids, dedupe, and attach the canonical name/state.
function normalizeDistricts(list: { districtId: string; severity: SituationSeverity; note: string }[]): AffectedDistrict[] {
  const known = new Map(DISTRICTS.map(d => [d.id, d]))
  const seen = new Set<string>()
  const out: AffectedDistrict[] = []
  for (const d of list) {
    const k = known.get(d.districtId)
    if (!k || seen.has(k.id)) continue
    seen.add(k.id)
    out.push({ districtId: k.id, name: k.name, state: k.state, severity: d.severity, note: d.note.trim() })
  }
  return out
}

// OpenAI-compatible chat path (Groq free tier, OpenRouter free models,
// local Ollama/LM Studio…). These endpoints don't support Gemini's
// responseSchema, so we ask for JSON in the prompt and parse/validate it
// with zod on our side — the same belt-and-braces as vision.ts.
async function callOpenAIAnalysis(e: Evidence): Promise<{ severity: SituationSeverity; summary: string; affectedDistricts: AffectedDistrict[]; recommendedActions: string[] }> {
  const key = apiKey()
  if (!key) throw new Error('no VISION_API_KEY configured')
  const model = currentModel()
  const res = await fetch(`${openaiBase()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: 800,
      ...(vendorName() === 'groq' && model === 'qwen/qwen3.6-27b'
        ? { reasoning_effort: 'none', reasoning_format: 'hidden', response_format: { type: 'json_object' } }
        : {}),
      messages: [
        {
          role: 'system',
          content: 'You are a disaster-analysis assistant. Reply with ONLY a JSON object matching the requested schema — no prose, no markdown fences.',
        },
        { role: 'user', content: buildPrompt(e) },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`analysis provider ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content ?? ''
  // Tolerate ```json fences the way vision.ts tolerates surrounding prose.
  const m = content.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('analysis provider returned no JSON object')
  const parsed = geminiReportSchema.parse(JSON.parse(m[0]))
  return {
    severity: parsed.severity,
    summary: parsed.summary,
    affectedDistricts: normalizeDistricts(parsed.affectedDistricts),
    recommendedActions: parsed.recommendedActions.map(a => a.trim()).filter(Boolean),
  }
}

// ── Deterministic fallback (same inputs, no network/model) ─────────────────
const districtScore = (d: DistrictEvidence): number => {
  let s = d.blockedRoads * 30 + d.cautionRoads * 10
  if (d.govtMaxSeverity === 'high') s += 30
  else if (d.govtMaxSeverity === 'medium') s += 12
  if (d.maxRisk >= 60) s += 18
  else if (d.maxRisk >= 40) s += 8
  if (d.rainMm >= 20) s += 10
  else if (d.rainMm >= 10) s += 4
  if (d.haltedVehicles >= 1) s += 6
  if (d.minStockDays !== null && d.minStockDays <= 3) s += 6
  return s
}

const scoreToSeverity = (s: number): SituationSeverity =>
  s >= 60 ? 'critical' : s >= 30 ? 'high' : s >= 10 ? 'moderate' : 'low'

function districtNote(d: DistrictEvidence): string {
  const parts: string[] = []
  if (d.blockedRoads) parts.push(`${d.blockedRoads} corridor(s) blocked`)
  if (d.cautionRoads) parts.push(`${d.cautionRoads} corridor(s) on caution`)
  if (d.govtMaxSeverity === 'high') parts.push('official high-severity alert')
  else if (d.govtMaxSeverity === 'medium') parts.push('official alert')
  if (d.rainMm >= 10) parts.push(`${Math.round(d.rainMm)} mm/h rain`)
  if (d.haltedVehicles) parts.push(`${d.haltedVehicles} convoy(s) halted`)
  if (d.minStockDays !== null && d.minStockDays <= 3) parts.push(`${d.minStockDays} days of stock left`)
  return parts.join('; ') || 'no significant signal'
}

const severityRank: Record<SituationSeverity, number> = { low: 0, moderate: 1, high: 2, critical: 3 }

function deterministicReport(e: Evidence): Omit<SituationReport, 'live' | 'generatedAt' | 'model' | 'reason'> {
  const signal = e.districts.filter(hasSignal)
  const blocked = signal.filter(d => d.blockedRoads > 0)
  const heavyRain = signal.filter(d => d.rainMm >= 15)
  const lowStock = signal.filter(d => d.minStockDays !== null && d.minStockDays <= 3)
  const alerts = signal.filter(d => d.govtMaxSeverity === 'high' || d.govtMaxSeverity === 'medium')

  const scored = signal
    .map(d => ({ d, score: districtScore(d) }))
    .sort((a, b) => b.score - a.score)
  const affectedDistricts: AffectedDistrict[] = scored
    .map(({ d }) => ({ districtId: d.id, name: d.name, state: d.state, severity: scoreToSeverity(districtScore(d)), note: districtNote(d) }))
  // Region severity follows the worst-affected district (breadth must not
  // inflate it: ten "moderate" districts don't make a "critical" region).
  const severity = affectedDistricts.reduce<SituationSeverity>(
    (worst, d) => (severityRank[d.severity] > severityRank[worst] ? d.severity : worst),
    'low',
  )

  const actions: string[] = []
  if (blocked.length) actions.push(`Hold inbound freight on blocked corridors and route via open alternates (${blocked.slice(0, 4).map(d => d.name).join(', ')}).`)
  if (alerts.length) actions.push(`Follow NDMA/IMD/SDMA guidance in ${alerts.slice(0, 4).map(d => d.name).join(', ')}; restrict non-essential movement.`)
  if (heavyRain.length) actions.push(`Enforce convoy speed limits and schedule buffers in ${heavyRain.slice(0, 4).map(d => d.name).join(', ')} (heavy rain).`)
  if (lowStock.length) actions.push(`Pre-position relief stock in ${lowStock.slice(0, 4).map(d => d.name).join(', ')} (≤3 days remaining).`)
  if (e.region.fleet.halted) actions.push('Prioritise medicine/relief convoys; arrange last-mile handoff for halted vehicles.')
  if (!actions.length) actions.push('No critical signals — continue routine monitoring.')

  const summary = severity === 'low'
    ? 'No significant disruptions detected across NER corridors; normal operations continue.'
    : `${severity.charAt(0).toUpperCase() + severity.slice(1)} situation across North East India: ${e.region.roads.blocked} district(s) with blocked corridors, ${e.region.roads.caution} with caution corridors, ${e.region.govt.count} official alert(s), ${e.region.fleet.halted} convoy(s) halted.` +
      (blocked.length ? ` Most affected: ${blocked.slice(0, 4).map(d => d.name).join(', ')}.` : '')

  return { severity, summary, affectedDistricts, recommendedActions: actions.slice(0, 6) }
}

// ── Cache + status (mirrors weatherStatus / govtAlertsStatus) ──────────────
let cache: { report: SituationReport; fetchedAt: number } | null = null
let inflight: Promise<SituationReport> | null = null
let lastError: string | null = null

async function computeReport(): Promise<SituationReport> {
  const evidence = await assembleEvidence()
  const generatedAt = new Date().toISOString()

  if (!analysisEnabled()) {
    lastError = 'analysis disabled (ANALYSIS_ENABLED=false)'
    return { ...deterministicReport(evidence), live: false, generatedAt, model: null, reason: lastError }
  }
  if (!apiKey()) {
    lastError = 'no VISION_API_KEY configured'
    return { ...deterministicReport(evidence), live: false, generatedAt, model: null, reason: lastError }
  }

  try {
    const provider = providerName()
    const raw = provider === 'openai' ? await callOpenAIAnalysis(evidence) : await callGeminiAnalysis(evidence)
    lastError = null
    return { ...raw, live: true, generatedAt, model: `${provider}:${currentModel()}`, reason: null }
  } catch (err) {
    const reason = `${providerName()} unavailable (${String((err as Error)?.message ?? err).slice(0, 160)})`
    lastError = reason
    console.error('[analysis]', reason)
    return { ...deterministicReport(evidence), live: false, generatedAt, model: null, reason }
  }
}

export async function getSituationReport(force = false): Promise<SituationReport> {
  if (!force) {
    if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.report
    if (inflight) return inflight
    inflight = computeReport()
      .then(report => { cache = { report, fetchedAt: Date.now() }; return report })
      .finally(() => { inflight = null })
    return inflight
  }
  const report = await computeReport()
  cache = { report, fetchedAt: Date.now() }
  return report
}

export function forceRefreshAnalysis(): Promise<SituationReport> {
  return getSituationReport(true)
}

// One-shot connectivity self-test: a tiny live call to the configured
// provider (used by POST /api/analysis/test and scripts/check-llm.ts), so the
// demo can prove the LLM is actually reachable in one command. Never throws.
export async function testProvider(): Promise<{ ok: boolean; provider: string; model: string; baseUrl: string; latencyMs: number; error?: string }> {
  const provider = providerName()
  const model = currentModel()
  const key = apiKey()
  const baseUrl = provider === 'gemini' ? geminiBase() : openaiBase()
  const start = Date.now()
  if (!key) return { ok: false, provider, model, baseUrl, latencyMs: Date.now() - start, error: 'no VISION_API_KEY configured' }
  try {
    let res: Response
    if (provider === 'openai') {
      res = await fetch(`${openaiBase()}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
        signal: AbortSignal.timeout(15_000),
      })
    } else {
      res = await fetch(`${geminiBase()}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 4 } }),
        signal: AbortSignal.timeout(15_000),
      })
    }
    if (!res.ok) {
      return { ok: false, provider, model, baseUrl, latencyMs: Date.now() - start, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
    }
    return { ok: true, provider, model, baseUrl, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, provider, model, baseUrl, latencyMs: Date.now() - start, error: String((err as Error)?.message ?? err).slice(0, 200) }
  }
}

export function analysisStatus() {
  return {
    enabled: analysisEnabled(),
    provider: providerName(),
    vendor: vendorName(),
    live: cache?.report.live ?? false,
    model: cache?.report.model ?? `${vendorName()}:${currentModel()}`,
    fetchedAt: cache?.fetchedAt ?? null,
    ttlMs: TTL_MS,
    lastError,
  }
}
