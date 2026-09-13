// ── Incident-photo AI: pluggable vision adapter ─────────────────────────
//
// Answers ONE question about an uploaded photo: "does this show a road /
// transport disruption (landslide, flood, debris, damage, accident) — and
// how severe is it?" — while giving LOW relevance and LOW confidence to
// unrelated pictures (selfies, screenshots, indoor shots), so a random
// upload can never push a corridor to 'blocked' on its own.
//
// Providers (chosen by VISION_PROVIDER in server/.env):
//   groq      — RECOMMENDED / FREE. Groq's free tier serves open vision
//               models (Qwen 3.6 27B — image+text, OCR, VQA; Llama 4
//               Maverick) through an OpenAI-compatible API, no card needed.
//               Needs VISION_API_KEY=gsk_… from console.groq.com. Groq
//               retires models on a schedule (Llama 4 Scout went 2026-07);
//               VISION_MODEL overrides the preset if that happens again.
//   openrouter— free ":free" vision models (e.g. google/gemma-4-31b-it:free)
//               via openrouter.ai. Needs VISION_API_KEY=sk-or-….
//   ollama    — fully offline, self-hosted (ollama pull qwen2.5vl / llava).
//               No key; VISION_BASE_URL defaults to http://127.0.0.1:11434/v1.
//   openai    — any other OpenAI-compatible chat endpoint (OpenAI itself,
//               LM Studio, vLLM…). VISION_API_KEY + optional VISION_MODEL /
//               VISION_BASE_URL.
//   gemini    — Google Gemini vision (paid past the trial). VISION_API_KEY.
//   heuristic — the built-in pixel-statistics classifier (lib/photo.ts). No
//               network, no key. Default when nothing is configured.
//
// groq / openrouter / ollama are presets over the same OpenAI-compatible
// call — they just pick the base URL and a good default vision model, so
// switching costs two lines of .env and nothing else changes.
//
// Whatever the provider, a network/parse failure falls back to the
// heuristic so photo upload never breaks. The response shape is identical
// so the frontend and DB don't care which produced it.
import { analyzePhoto, type PhotoAnalysis } from './photo'
import type { Severity } from '../data/types'

export type IncidentKind = 'landslide' | 'flood' | 'roadblock' | 'damage' | 'accident' | 'weather' | 'none'

export type VisionProvider = 'groq' | 'openrouter' | 'ollama' | 'openai' | 'gemini' | 'heuristic'

// Presets for the OpenAI-compatible providers. Defaults are the strongest
// vision model each one currently serves for free; override with
// VISION_MODEL if a provider retires one (Groq lists deprecations at
// console.groq.com/docs/deprecations).
const OPENAI_COMPAT: Record<'groq' | 'openrouter' | 'ollama' | 'openai', { baseUrl: string; model: string; needsKey: boolean }> = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.6-27b', needsKey: true },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemma-4-31b-it:free', needsKey: true },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5vl', needsKey: false },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
}
const isOpenAICompat = (p: VisionProvider): p is keyof typeof OPENAI_COMPAT => p in OPENAI_COMPAT

export interface VisionResult {
  provider: VisionProvider
  model: string
  /** Is this actually a picture of a road/transport disruption? 0..1 */
  relevance: number
  /** What the model thinks it is (matches IncidentType where possible). */
  incident: IncidentKind
  severity: Severity
  confidence: number // 0..1
  /** Short human-readable justification shown to the reporter/official. */
  summary: string
  /** Heuristic pixel features (always computed — cheap, useful for audit). */
  features: Pick<PhotoAnalysis, 'width' | 'height' | 'lumaMean' | 'lumaStd' | 'bottomDarkRatio' | 'earthRatio' | 'edgeEnergy' | 'disruption'>
}

const PROMPT = `You are a field-inspection assistant for a logistics platform in North East India.
Look at the photo and decide whether it shows a ROAD / BRIDGE / TRANSPORT DISRUPTION such as a landslide, flood/waterlogging, debris or rockfall, road or bridge damage, or a vehicle accident blocking passage.

Respond with ONLY a compact JSON object, no prose, with exactly these keys:
{
  "relevance": number 0..1  — how sure you are the photo depicts a road/transport scene at all (0 = unrelated photo: selfie, screenshot, indoor, food, text…),
  "incident": one of "landslide" | "flood" | "roadblock" | "damage" | "accident" | "weather" | "none",
  "severity": one of "minor" | "partial" | "impassable"  — passability for a loaded truck. "minor" = passable with care, "partial" = single lane / light vehicles only, "impassable" = blocked,
  "confidence": number 0..1  — your confidence in the severity call,
  "summary": one sentence (max 25 words) describing what you see and why.
}
If the photo is unrelated or ambiguous, set relevance low, incident "none", severity "minor", confidence low.`

function providerName(): VisionProvider {
  const p = (process.env.VISION_PROVIDER || '').toLowerCase().trim()
  const key = (process.env.VISION_API_KEY || '').trim()
  if (p === 'gemini' && key) return 'gemini'
  if (isOpenAICompat(p as VisionProvider)) {
    const preset = OPENAI_COMPAT[p as keyof typeof OPENAI_COMPAT]
    if (!preset.needsKey || key) return p as VisionProvider
  }
  return 'heuristic'
}

export function currentVisionModel(provider: VisionProvider = providerName()): string {
  if (provider === 'heuristic') return 'pixel-heuristic-v2'
  if (provider === 'gemini') return process.env.VISION_MODEL || 'gemini-2.5-flash'
  return process.env.VISION_MODEL || OPENAI_COMPAT[provider].model
}

export function visionBaseUrl(provider: VisionProvider = providerName()): string | null {
  if (!isOpenAICompat(provider)) return null
  return (process.env.VISION_BASE_URL || OPENAI_COMPAT[provider].baseUrl).replace(/\/+$/, '')
}

export function visionStatus() {
  const provider = providerName()
  return {
    provider,
    model: currentVisionModel(provider),
    baseUrl: visionBaseUrl(provider),
    live: provider !== 'heuristic',
    free: provider === 'groq' || provider === 'openrouter' || provider === 'ollama' || provider === 'heuristic',
  }
}

function heuristicResult(buffer: Buffer, mime: string): VisionResult {
  const a = analyzePhoto(buffer, mime)
  // The heuristic cannot recognise objects, so it must never sound sure:
  // relevance is unknown (0.5) and confidence is capped well below what a
  // real model returns for a clear disaster photo. It also never claims
  // 'impassable' on its own — that needs either a real model or an official.
  const severity: Severity = a.severity === 'impassable' ? 'partial' : a.severity
  const incident: IncidentKind = severity === 'minor' ? 'none'
    : a.blueBias > 0.1 ? 'flood' : a.earthRatio > 0.2 ? 'landslide' : 'roadblock'
  return {
    provider: 'heuristic',
    model: 'pixel-heuristic-v2',
    relevance: 0.5,
    incident,
    severity,
    confidence: Math.min(0.6, a.confidence),
    summary: severity === 'minor'
      ? 'Pixel analysis found no strong debris/water signature — treat as low unless the description says otherwise.'
      : `Pixel analysis: ${Math.round(a.earthRatio * 100)}% earth-toned, ${Math.round(a.bottomDarkRatio * 100)}% dark low-frame, texture ${Math.round(a.edgeEnergy)} — consistent with ${incident}. Not object-aware; verify in the field.`,
    features: pick(a),
  }
}

function pick(a: PhotoAnalysis) {
  return {
    width: a.width, height: a.height,
    lumaMean: Math.round(a.lumaMean), lumaStd: Math.round(a.lumaStd),
    bottomDarkRatio: Math.round(a.bottomDarkRatio * 100) / 100,
    earthRatio: Math.round(a.earthRatio * 100) / 100,
    edgeEnergy: Math.round(a.edgeEnergy), disruption: a.disruption,
  }
}

function parseModelJson(text: string) {
  // Reasoning models may wrap thoughts in <think>…</think> or fence the JSON.
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '')
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) {
    // An unclosed <think> means the response got cut off mid-reasoning —
    // almost always max_tokens is too small for this model, not a bad
    // response. Distinguishing this from "model just didn't return JSON"
    // makes the next occurrence obvious from the server log.
    if (/<think>/i.test(text) && !/<\/think>/i.test(text)) {
      throw new Error('vision model response was truncated mid-reasoning (max_tokens too low for this model)')
    }
    throw new Error('vision model returned no JSON')
  }
  const j = JSON.parse(m[0]) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d)
  const sev = ['minor', 'partial', 'impassable'].includes(String(j.severity)) ? j.severity as Severity : 'minor'
  const kinds: IncidentKind[] = ['landslide', 'flood', 'roadblock', 'damage', 'accident', 'weather', 'none']
  const incident = kinds.includes(j.incident as IncidentKind) ? j.incident as IncidentKind : 'none'
  return {
    relevance: num(j.relevance, 0.3),
    incident,
    severity: sev,
    confidence: num(j.confidence, 0.4),
    summary: typeof j.summary === 'string' ? j.summary.slice(0, 240) : '',
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('vision request timed out')), ms) })
  try { return await Promise.race([p, timeout]) } finally { clearTimeout(t!) }
}

async function callOpenAI(provider: keyof typeof OPENAI_COMPAT, buffer: Buffer, mime: string) {
  const base = visionBaseUrl(provider)!
  const model = currentVisionModel(provider)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = (process.env.VISION_API_KEY || '').trim()
  if (key) headers.Authorization = `Bearer ${key}`
  if (provider === 'openrouter') {
    // OpenRouter asks for these to attribute free-tier usage.
    headers['HTTP-Referer'] = process.env.PUBLIC_APP_URL || 'https://github.com/GameDevRISHI/Logistic'
    headers['X-Title'] = 'SETU-NER'
  }
  const res = await withTimeout(fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // Keep the generated response below the organization's 1000-token
      // output-token-per-minute ceiling. Qwen 3.6 supports non-thinking mode,
      // which is ideal here because the app only needs a compact JSON result.
      model, temperature: 0, max_completion_tokens: 800,
      ...(provider === 'groq' && model === 'qwen/qwen3.6-27b'
        ? { reasoning_effort: 'none', reasoning_format: 'hidden', response_format: { type: 'json_object' } }
        : {}),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          // `detail` is an OpenAI extension; other providers ignore or reject it.
          { type: 'image_url', image_url: provider === 'openai'
            ? { url: `data:${mime};base64,${buffer.toString('base64')}`, detail: 'low' }
            : { url: `data:${mime};base64,${buffer.toString('base64')}` } },
        ],
      }],
    }),
  }), 25_000)
  if (!res.ok) throw new Error(`vision provider ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return { model, ...parseModelJson(data.choices?.[0]?.message?.content ?? '') }
}

async function callGemini(buffer: Buffer, mime: string) {
  const model = process.env.VISION_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.VISION_API_KEY}`
  const res = await withTimeout(fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: { temperature: 0, maxOutputTokens: 200 },
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: buffer.toString('base64') } }] }],
    }),
  }), 25_000)
  if (!res.ok) throw new Error(`vision provider ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
  return { model, ...parseModelJson(text) }
}

// Relevance gate: an unrelated photo must not produce a scary severity even
// if the model hedged. Below 0.35 relevance → 'minor', confidence scaled down.
function gate(r: { relevance: number; severity: Severity; confidence: number; incident: IncidentKind }) {
  if (r.relevance < 0.35 || r.incident === 'none') {
    return { ...r, severity: 'minor' as Severity, confidence: Math.min(r.confidence, 0.4) * r.relevance + 0.1 }
  }
  return { ...r, confidence: Math.round(Math.min(0.98, r.confidence * (0.6 + 0.4 * r.relevance)) * 100) / 100 }
}

export async function analyzeIncidentPhoto(buffer: Buffer, mime: string): Promise<VisionResult> {
  const heuristic = heuristicResult(buffer, mime) // also validates the image decodes
  const provider = providerName()
  if (provider === 'heuristic') return heuristic
  try {
    const raw = provider === 'gemini' ? await callGemini(buffer, mime) : await callOpenAI(provider, buffer, mime)
    const g = gate(raw)
    return {
      provider, model: raw.model,
      relevance: Math.round(g.relevance * 100) / 100,
      incident: g.incident, severity: g.severity,
      confidence: Math.round(g.confidence * 100) / 100,
      summary: raw.summary || heuristic.summary,
      features: heuristic.features,
    }
  } catch (err) {
    console.error(`[vision:${provider}] failed, using heuristic:`, (err as Error).message)
    return { ...heuristic, summary: `${heuristic.summary} (AI model unavailable: ${(err as Error).message.slice(0, 80)})` }
  }
}
