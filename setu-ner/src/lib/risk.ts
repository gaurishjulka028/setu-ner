// ── Terrain-based risk model ───────────────────────────────────────────────
// Risk score 0–100 per segment, combining terrain (slope/elevation), monsoon
// failure history, live rainfall (Open-Meteo), and low-cost sensor readings.
// Road AND waterway segments score through the same riskOf() — waterway
// edges carry gentle terrain + a waterLevel draft sensor so nothing here
// branches on mode except the rainfall gate (a river rises in rain the same
// way a hill fails — but is far less slope-sensitive).
//
// Routing (dijkstra/planRoutes/buildAdjacency) used to live here too; it
// was removed in Part B — PlanRoute.tsx calls the backend's
// POST /api/route-suggestion instead (server/src/engine/risk.ts holds the
// ported routing engine). Only helpers still imported by pages/components
// remain below.
import type { Segment, Season, WeatherPoint, CargoType, RoadType, Vehicle } from '../types'
import { SEGMENTS, isWaterway, navigableFor } from '../data/ner'
import { learnedRiskFactor } from './riskModel'

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x))

// ── Congestion (mirrors server/src/engine/risk.ts — see that file's
// comment for the reasoning). Server-simulated/real vehicles are the
// source of truth; the client passes its store's `vehicles` array in. ──
const ROAD_CAPACITY: Record<RoadType, number> = { NH: 8, SH: 6, rural: 3, bridge: 2, waterway: 4 }

export function currentSegmentId(v: Pick<Vehicle, 'path' | 'progressKm'>): string | undefined {
  let remaining = v.progressKm
  for (const segId of v.path) {
    const seg = SEGMENTS.find(s => s.id === segId)
    if (!seg) continue
    if (remaining <= seg.lengthKm) return segId
    remaining -= seg.lengthKm
  }
  return v.path[v.path.length - 1]
}

export function computeCongestionCounts(vehicles: Pick<Vehicle, 'path' | 'progressKm'>[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const v of vehicles) {
    const segId = currentSegmentId(v)
    if (segId) counts[segId] = (counts[segId] ?? 0) + 1
  }
  return counts
}

export function congestionFactor(seg: Segment, congestionCounts: Record<string, number>): number {
  const count = congestionCounts[seg.id] ?? 0
  const capacity = ROAD_CAPACITY[seg.roadType] ?? 4
  return clamp(Math.round((count / capacity) * 100))
}

// Nearest weather anchor to a coordinate
function nearestPoint(lat: number, lng: number, weather: Record<string, WeatherPoint>): WeatherPoint | null {
  const pts = Object.values(weather)
  if (!pts.length) return null
  let best = pts[0], bd = Infinity
  for (const p of pts) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2
    if (d < bd) { bd = d; best = p }
  }
  return best
}

// Current rainfall intensity (mm/h)
export function rainAt(lat: number, lng: number, weather: Record<string, WeatherPoint>): number {
  return nearestPoint(lat, lng, weather)?.rainNow ?? 0
}

// Predictive rainfall exposure: current rain blended with the forecast peak
// over the next 6 hours — rerouting decisions should react BEFORE the rain
// peaks over a landslide-prone stretch, not after.
export function rainExposure(lat: number, lng: number, weather: Record<string, WeatherPoint>): number {
  const p = nearestPoint(lat, lng, weather)
  if (!p) return 0
  const peak6 = Math.max(0, ...p.forecast.slice(0, 6).map(f => f.rain))
  return Math.max(p.rainNow, peak6 * 0.7)
}

function midpoint(seg: Segment): [number, number] {
  const c = seg.coords
  return c[Math.floor(c.length / 2)]
}

export interface RiskBreakdown {
  total: number
  terrain: number
  history: number // season-weighted failure-history factor (scalar)
  rain: number
  sensor: number
  learned: number // logistic-regression failure probability, 0-100 (see lib/riskModel.ts)
  congestion: number // live fleet density vs road-type capacity, 0-100
  status: 'open' | 'caution' | 'blocked'
  rainMm: number
  trend: number[] // 24 risk points over 48h (future, +0..+48h)
  riskHistory: number[] // 24 simulated readings over the PAST 48h (for charts)
}

export function riskOf(seg: Segment, weather: Record<string, WeatherPoint>, season: Season = 'monsoon', congestionCounts: Record<string, number> = {}): RiskBreakdown {
  const [mlat, mlng] = midpoint(seg)
  const rainMm = rainAt(mlat, mlng, weather)          // current — for display
  const rainExp = rainExposure(mlat, mlng, weather)   // predictive — for the model
  const water = isWaterway(seg)

  // 1. Terrain factor: slope (landslide susceptibility) + elevation, 0–100
  //    (waterways are near-flat, so this stays tiny for them)
  const terrain = clamp(seg.slope * 5.2 + Math.log10(seg.elevation + 1) * 12)

  // 2. Season-weighted failure history (same stretch in past monsoons)
  const histFactor = seg.failureHistory * (season === 'monsoon' ? 9 : 4.5)

  // 3. Rainfall factor from predictive exposure (current + 6h forecast peak),
  //    terrain-gated. Heavy rain on flat plains ≠ landslide; on high-slope
  //    single-lane ghats it drives proactive reroutes. Waterways still rise:
  //    their flood/erosion exposure keeps a 0.5 gate instead of the flat 0.32.
  const terrainGate = seg.terrain === 'flat' ? (water ? 0.5 : 0.32) : seg.terrain === 'hilly' ? 0.72 : 1.0
  const rainFactor = clamp(Math.pow(rainExp / 26, 0.85) * 82 * terrainGate, 0, 100)

  // 4. Low-cost sensor factor: vibration (rock movement), water level, surface
  const sensor = clamp(seg.sensor.vibration * 0.42 + seg.sensor.waterLevel * 0.33 + seg.sensor.surface * 0.25)

  // 5. Waterway-specific: draft/water-level headroom. When the (simulated)
  //    gauge sits near the barge draft limit the stretch is effectively
  //    impassable for cargo — reflected as a caution/blocked driver.
  let draftRisk = 0
  if (water && seg.draftM != null) {
    const headroom = seg.draftM - (seg.sensor.waterLevel / 100) * 3.2 // ~0.1–3.1 m effective
    if (headroom < 0.35) draftRisk = 62
    else if (headroom < 0.8) draftRisk = 34
  }

  // 6. Learned factor: hand-rolled logistic regression trained offline on
  //    a synthetic historical-failure dataset (see lib/riskModel.ts — this
  //    is the actually-learned piece; the four terms above are a
  //    hand-weighted rule formula, not ML). Weight budget rebalanced from
  //    the pre-ML version so the learned term (0.15) has real influence.
  const learned = learnedRiskFactor({
    terrain, histFactor, rainFactor, sensor,
    singleLane: !!seg.singleLane,
    poorCondition: seg.baseCondition === 'poor',
  })

  // 7. Congestion: live fleet density on this segment vs. its road-type
  //    capacity. See server/src/engine/risk.ts for the full weight-budget
  //    rebalancing note (this mirrors it exactly).
  const congestion = congestionFactor(seg, congestionCounts)

  const total = clamp(
    terrain * 0.22 + histFactor * 0.15 + rainFactor * 0.18 + sensor * 0.16 + learned * 0.13 + congestion * 0.10
    + (seg.singleLane ? 4 : 0) + (seg.baseCondition === 'poor' ? 4 : 0)
    + draftRisk
  )

  // Status: verified reported closures win; otherwise model-derived thresholds
  let status: RiskBreakdown['status'] = 'open'
  if (seg.reportedStatus === 'blocked') status = 'blocked'
  else if (seg.reportedStatus === 'caution') status = 'caution'
  else if (total >= 68 && (seg.failureHistory >= 4 || water)) status = 'blocked'
  else if (total >= 45) status = 'caution'

  // 24h "past" simulated readings (history) + 24h future (trend) — same
  // deterministic weather/hash shape so both charts read as one line.
  const series = (hourOffset: number, i: number) => {
    const h = hourOffset + i * 2
    const f = weatherForecastAt(mlat, mlng, weather, h)
    const wave = Math.sin((hash(seg.id) % 12) + h / 6.4) * 7
    return clamp(terrain * 0.35 + histFactor * 0.32 + clamp(Math.pow(f / 20, 0.8) * 60) * 0.3 + wave + (water ? draftRisk * 0.3 : 0))
  }
  const riskHistory = Array.from({ length: 24 }, (_, i) => Math.round(series(-48, i)))
  const trend = Array.from({ length: 24 }, (_, i) => Math.round(series(0, i)))

  return { total: Math.round(total), terrain: Math.round(terrain), history: Math.round(histFactor), rain: Math.round(rainFactor), sensor: Math.round(sensor), learned, congestion, status, rainMm: Math.round(rainMm * 10) / 10, trend, riskHistory }
}

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

function weatherForecastAt(lat: number, lng: number, weather: Record<string, WeatherPoint>, hourOffset: number): number {
  const pts = Object.values(weather)
  if (!pts.length) return 0
  let best = pts[0], bd = Infinity
  for (const p of pts) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2
    if (d < bd) { bd = d; best = p }
  }
  const idx = Math.max(0, Math.min(23, hourOffset + 2))
  return best.forecast[idx]?.rain ?? best.rainNow
}

// Crowd + sensor accessibility score (0–100, higher = more passable/accessible)
export function accessibilityScore(seg: Segment, weather: Record<string, WeatherPoint>, season: Season): number {
  const r = riskOf(seg, weather, season).total
  const reportConf = seg.reportedStatus === 'blocked' ? 45 : seg.reportedStatus === 'caution' ? 18 : 0
  const bridgePenalty = seg.roadType === 'bridge' ? 4 : 0
  return Math.round(clamp(100 - r - reportConf - bridgePenalty - (seg.sensor.surface > 60 ? 8 : 0)))
}

export function statusColor(status: 'open' | 'caution' | 'blocked'): string {
  return status === 'open' ? '#2E9E5B' : status === 'caution' ? '#E0A929' : '#D64545'
}

// Town choices for route planning (PlanRoute.tsx). Kept client-side: the
// list is static reference data; only the routing math moved to the backend.
export function townOptions() {
  return [...new Set(SEGMENTS.flatMap(s => [s.from, s.to]))].sort()
}

// ETA window suggestion for convoy bunching on single-lane high-risk roads
export function convoyWindow(risk: number, segName?: string) {
  if (risk < 55 || !segName) return null
  const depart = new Date(Date.now() + 45 * 60 * 1000)
  const close = new Date(depart.getTime() + 40 * 60 * 1000)
  const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(depart)} – ${fmt(close)}`
}

// ── Route-planning helpers (waterway-aware) ────────────────────────────────
// The backend owns actual routing (POST /api/route-suggestion); these
// client helpers power PlanRoute's "underused regional capacity" surfacing
// and MapView's waterway layer.
export function roadSegments() { return SEGMENTS.filter(s => !isWaterway(s)) }
export function allWaterwayRisk(weather: Record<string, WeatherPoint>, season: Season) {
  return SEGMENTS.filter(isWaterway).map(seg => ({ seg, r: riskOf(seg, weather, season) }))
}
// True when the road corridor between origin/destination is materially
// worse than the parallel river corridor at the current weather.
export function waterwayBetterThanRoad(
  fromName: string, toName: string,
  weather: Record<string, WeatherPoint>, season: Season, cargo: CargoType,
): { waterway: Segment; waterwayRisk: number; parallelRoad: Segment | undefined; roadRisk: number } | null {
  const usable = SEGMENTS.filter(isWaterway)
    .filter(seg => (seg.from === fromName && seg.to === toName) || (seg.from === toName && seg.to === fromName))
    .filter(seg => navigableFor(seg, cargo))
  if (!usable.length) return null
  // "parallel road" = the most direct NH/SH corridor linking the same towns
  const parallelRoad = SEGMENTS.find(seg => !isWaterway(seg) &&
    ((seg.from === fromName && seg.to === toName) || (seg.from === toName && seg.to === fromName)))
  const waterway = usable.sort((a, b) => riskOf(a, weather, season).total - riskOf(b, weather, season).total)[0]
  const w = riskOf(waterway, weather, season).total
  const roadR = parallelRoad ? riskOf(parallelRoad, weather, season).total : 75
  return w < roadR - 8 ? { waterway, waterwayRisk: w, parallelRoad, roadRisk: roadR } : null
}

// Number of road segments currently at elevated weather risk (Home banner).
export function elevatedWeatherRiskSegments(weather: Record<string, WeatherPoint>, season: Season, threshold = 48): number {
  return SEGMENTS.filter(s => !isWaterway(s) && riskOf(s, weather, season).total >= threshold).length
}
