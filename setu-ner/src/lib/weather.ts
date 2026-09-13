// ── Weather via the backend proxy (Part 3 step 2) ────────────────────────
// Was: direct Open-Meteo calls from the browser. Now: the backend's
// GET /api/weather?lat=&lng= (added in Part 2), which caches per-coordinate
// server-side. Same anchors, same fallback table, same shape callers get —
// only the transport changed.
import type { WeatherPoint } from '../types'
import { NODES } from '../data/ner'
import { api } from './api'

const ANCHORS = ['GHY', 'SIL', 'HFL', 'SHL', 'IMP', 'DMP', 'ITN', 'AGT', 'AZL']

// Monsoon baseline fallback (used offline / before first fetch, or if the
// backend itself is unreachable)
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

export async function fetchWeather(signal?: AbortSignal): Promise<Record<string, WeatherPoint>> {
  try {
    const entries = await Promise.all(ANCHORS.map(async code => {
      const n = NODES[code]
      const point = await api.get<WeatherPoint>(`/api/weather?lat=${n.lat}&lng=${n.lng}`, { signal })
      // The proxy answers per-coordinate; overlay the anchor's identity so
      // downstream code (risk.ts nearest-point lookups, map labels) sees
      // the same shape it always did.
      return [code, { ...point, id: code, name: n.name, lat: n.lat, lng: n.lng }] as const
    }))
    return Object.fromEntries(entries)
  } catch {
    return fallbackWeather()
  }
}
