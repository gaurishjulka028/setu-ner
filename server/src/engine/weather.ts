// Ported from setu-ner/src/lib/weather.ts, moved server-side per Part 2
// step 1: same Open-Meteo source and fallback table, now called from
// Node instead of the browser, with an in-memory cache so repeated
// requests for the same coordinate/region don't re-hit Open-Meteo.
import type { WeatherPoint } from '../data/types'
import { NODES } from '../data/ner'

const CACHE_TTL_MS = 5 * 60 * 1000 // "a few minutes"

const ANCHORS = ['GHY', 'SIL', 'HFL', 'SHL', 'IMP', 'DMP', 'ITN', 'AGT', 'AZL']

const FALLBACK: Record<string, { rain: number; temp: number; pattern: number[] }> = {
  GHY: { rain: 6, temp: 31, pattern: [4, 6, 9, 12, 14, 11, 8, 7] },
  SIL: { rain: 18, temp: 29, pattern: [12, 16, 22, 28, 30, 24, 18, 14] },
  HFL: { rain: 26, temp: 24, pattern: [18, 24, 30, 34, 32, 26, 22, 18] },
  SHL: { rain: 14, temp: 23, pattern: [8, 12, 18, 22, 20, 16, 12, 9] },
  IMP: { rain: 12, temp: 26, pattern: [8, 10, 16, 20, 18, 14, 10, 8] },
  DMP: { rain: 9, temp: 30, pattern: [6, 8, 12, 15, 13, 10, 8, 6] },
  ITN: { rain: 11, temp: 27, pattern: [7, 9, 14, 18, 16, 12, 9, 7] },
  AGT: { rain: 8, temp: 30, pattern: [5, 7, 10, 12, 11, 9, 7, 5] },
  AZL: { rain: 15, temp: 25, pattern: [10, 13, 19, 23, 21, 17, 13, 10] },
}

function fallbackPoint(code: string): WeatherPoint {
  const n = NODES[code]
  const fb = FALLBACK[code] ?? FALLBACK.GHY
  const forecast = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    rain: Math.max(0, fb.pattern[Math.floor(i / 3) % 8] + Math.sin(i / 2.4) * 4),
  }))
  return { id: code, name: n.name, lat: n.lat, lng: n.lng, rainNow: fb.rain, tempC: fb.temp, forecast, fetchedAt: 0 }
}

export function fallbackWeather(): Record<string, WeatherPoint> {
  const out: Record<string, WeatherPoint> = {}
  for (const a of ANCHORS) out[a] = fallbackPoint(a)
  return out
}

// ── Region cache: the fixed set of NER anchor towns, used by the risk
// engine (nearest-anchor lookup). One shared cache entry for everyone.
let regionCache: { data: Record<string, WeatherPoint>; fetchedAt: number; live: boolean } | null = null

// Exposed to the UI's data-source legend: is the rain/risk colouring on the
// map driven by a real forecast right now, or by the monsoon baseline table?
export function weatherStatus() {
  return {
    live: regionCache?.live ?? false,
    fetchedAt: regionCache?.fetchedAt ?? null,
    provider: 'open-meteo.com',
    anchors: ANCHORS.length,
  }
}

export async function getRegionWeather(): Promise<Record<string, WeatherPoint>> {
  if (regionCache && Date.now() - regionCache.fetchedAt < CACHE_TTL_MS) return regionCache.data
  const { data, live } = await fetchRegionWeather()
  // Don't overwrite good live data with the fallback table on a transient
  // failure — keep serving the last real forecast (marked stale by age).
  if (!live && regionCache?.live) {
    regionCache = { ...regionCache, fetchedAt: Date.now() - CACHE_TTL_MS + 60_000 } // retry in a minute
    return regionCache.data
  }
  regionCache = { data, fetchedAt: Date.now(), live }
  return data
}

async function fetchRegionWeather(): Promise<{ data: Record<string, WeatherPoint>; live: boolean }> {
  const lats = ANCHORS.map(c => NODES[c].lat).join(',')
  const lngs = ANCHORS.map(c => NODES[c].lng).join(',')
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&current=temperature_2m,precipitation&hourly=precipitation&forecast_days=1&timezone=Asia%2FKolkata`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error('weather fetch failed')
    const data = await res.json() as any
    const list = Array.isArray(data) ? data : [data]
    const out: Record<string, WeatherPoint> = {}
    list.forEach((d: any, i: number) => {
      const code = ANCHORS[i]
      const n = NODES[code]
      const forecast = (d.hourly?.precipitation ?? []).slice(0, 24).map((r: number, h: number) => ({ hour: h, rain: Math.max(0, r ?? 0) }))
      out[code] = {
        id: code, name: n.name, lat: n.lat, lng: n.lng,
        rainNow: d.current?.precipitation ?? FALLBACK[code]?.rain ?? 6,
        tempC: d.current?.temperature_2m ?? 27,
        forecast: forecast.length ? forecast : fallbackPoint(code).forecast,
        fetchedAt: Date.now(),
      }
    })
    return { data: out, live: true }
  } catch (err) {
    if (regionCache?.live !== false) console.warn('[weather] Open-Meteo unreachable, using monsoon baseline table:', (err as Error).message)
    return { data: fallbackWeather(), live: false }
  } finally {
    clearTimeout(timer)
  }
}

// ── Single-point cache backing GET /api/weather?lat=&lng= ──────────────
const pointCache = new Map<string, { data: WeatherPoint; fetchedAt: number }>()

function pointKey(lat: number, lng: number) {
  // ~1.1km grid — enough to dedupe nearby requests without staleness.
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

export async function getWeatherPoint(lat: number, lng: number): Promise<WeatherPoint> {
  const key = pointKey(lat, lng)
  const cached = pointCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data

  const data = await fetchWeatherPoint(lat, lng)
  pointCache.set(key, { data, fetchedAt: Date.now() })
  return data
}

async function fetchWeatherPoint(lat: number, lng: number): Promise<WeatherPoint> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation&hourly=precipitation&forecast_days=1&timezone=Asia%2FKolkata`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('weather fetch failed')
    const d = await res.json() as any
    const forecast = (d.hourly?.precipitation ?? []).slice(0, 24).map((r: number, h: number) => ({ hour: h, rain: Math.max(0, r ?? 0) }))
    return {
      id: pointKey(lat, lng), name: `${lat.toFixed(2)}, ${lng.toFixed(2)}`, lat, lng,
      rainNow: d.current?.precipitation ?? 6,
      tempC: d.current?.temperature_2m ?? 27,
      forecast: forecast.length ? forecast : fallbackPoint('GHY').forecast,
      fetchedAt: Date.now(),
    }
  } catch {
    return { ...fallbackPoint('GHY'), id: pointKey(lat, lng), name: `${lat.toFixed(2)}, ${lng.toFixed(2)}`, lat, lng }
  }
}
