// Ported from setu-ner/src/lib/risk.ts (Part 2 step 2). The scoring model
// itself (terrain + rainfall + history + sensor weights, thresholds) is
// untouched — only the import source changed (SEGMENTS/NODES now come
// from the shared data barrel instead of being co-located in the same
// browser bundle). Mirrors setu-ner/src/lib/risk.ts (waterway scoring,
// history series, helpers) so client and server agree.
import type { Segment, Season, WeatherPoint, RouteResult, CargoType, RoadType, Vehicle } from '../data/types'
import { SEGMENTS, NODES, isWaterway, navigableFor } from '../data/ner'
import { learnedRiskFactor } from '../ml/riskModel'
import { getVehicles } from './vehicles'

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x))

// ── Congestion (problem-statement gap: named explicitly, previously absent
// from the risk engine entirely) ───────────────────────────────────────────
// Derived from live fleet density: how many vehicles currently occupy each
// segment, normalized against a rough per-road-type capacity constant.
// "Currently occupy" is approximated from progressKm consumed against each
// path segment's lengthKm (not full lat/lng interpolation like
// engine/vehicles.ts's vehiclePosition() — that precision isn't needed for
// a congestion sub-score).
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

// Convenience for callers (route handlers) that just want "current
// congestion, from the live simulated/real fleet" without wiring the
// vehicle list through themselves.
export function liveCongestionCounts(): Record<string, number> {
  return computeCongestionCounts(getVehicles())
}

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

export function rainAt(lat: number, lng: number, weather: Record<string, WeatherPoint>): number {
  return nearestPoint(lat, lng, weather)?.rainNow ?? 0
}

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
  learned: number // logistic-regression failure probability, 0-100 (see ml/riskModel.ts)
  congestion: number // live fleet density vs road-type capacity, 0-100
  status: 'open' | 'caution' | 'blocked'
  rainMm: number
  trend: number[] // 24 risk points over 48h (future)
  riskHistory: number[] // 24 simulated readings over the PAST 48h
}

export function riskOf(seg: Segment, weather: Record<string, WeatherPoint>, season: Season = 'monsoon', congestionCounts: Record<string, number> = {}): RiskBreakdown {
  const [mlat, mlng] = midpoint(seg)
  const rainMm = rainAt(mlat, mlng, weather)
  const rainExp = rainExposure(mlat, mlng, weather)
  const water = isWaterway(seg)

  const terrain = clamp(seg.slope * 5.2 + Math.log10(seg.elevation + 1) * 12)
  const histFactor = seg.failureHistory * (season === 'monsoon' ? 9 : 4.5)

  const terrainGate = seg.terrain === 'flat' ? (water ? 0.5 : 0.32) : seg.terrain === 'hilly' ? 0.72 : 1.0
  const rainFactor = clamp(Math.pow(rainExp / 26, 0.85) * 82 * terrainGate, 0, 100)

  const sensor = clamp(seg.sensor.vibration * 0.42 + seg.sensor.waterLevel * 0.33 + seg.sensor.surface * 0.25)

  // Waterway draft headroom: when the (simulated) gauge is near the barge
  // draft limit the stretch is effectively impassable for cargo.
  let draftRisk = 0
  if (water && seg.draftM != null) {
    const headroom = seg.draftM - (seg.sensor.waterLevel / 100) * 3.2
    if (headroom < 0.35) draftRisk = 62
    else if (headroom < 0.8) draftRisk = 34
  }

  // 6. Learned factor: a hand-rolled logistic regression trained offline
  //    on a synthetic historical-failure dataset (see ml/riskModel.ts —
  //    this is the actually-learned piece; the four terms above are a
  //    hand-weighted rule formula, not ML). Weight budget below is
  //    rebalanced from the pre-ML version (terrain 0.28→0.24, history
  //    0.20→0.17, rain 0.24→0.20, sensor 0.22→0.18) so the learned term
  //    (0.15) has real influence without the model's overall behavior
  //    swinging wildly relative to the pre-ML baseline.
  const learned = learnedRiskFactor({
    terrain, histFactor, rainFactor, sensor,
    singleLane: !!seg.singleLane,
    poorCondition: seg.baseCondition === 'poor',
  })

  // 7. Congestion: live fleet density on this segment vs. its road-type
  //    capacity (see computeCongestionCounts/congestionFactor above).
  //    Weight budget rebalanced again (terrain 0.24→0.22, history
  //    0.17→0.15, rain 0.20→0.18, sensor 0.18→0.16, learned 0.15→0.13,
  //    congestion 0.10) so congestion has real but modest influence — a
  //    jammed segment is an inconvenience, not a landslide.
  const congestion = congestionFactor(seg, congestionCounts)

  const total = clamp(
    terrain * 0.22 + histFactor * 0.15 + rainFactor * 0.18 + sensor * 0.16 + learned * 0.13 + congestion * 0.10
    + (seg.singleLane ? 4 : 0) + (seg.baseCondition === 'poor' ? 4 : 0)
    + draftRisk
  )

  let status: RiskBreakdown['status'] = 'open'
  if (seg.reportedStatus === 'blocked') status = 'blocked'
  else if (seg.reportedStatus === 'caution') status = 'caution'
  else if (total >= 68 && (seg.failureHistory >= 4 || water)) status = 'blocked'
  else if (total >= 45) status = 'caution'

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

export function accessibilityScore(seg: Segment, weather: Record<string, WeatherPoint>, season: Season): number {
  const r = riskOf(seg, weather, season).total
  const reportConf = seg.reportedStatus === 'blocked' ? 45 : seg.reportedStatus === 'caution' ? 18 : 0
  const bridgePenalty = seg.roadType === 'bridge' ? 4 : 0
  return Math.round(clamp(100 - r - reportConf - bridgePenalty - (seg.sensor.surface > 60 ? 8 : 0)))
}

export function statusColor(status: 'open' | 'caution' | 'blocked'): string {
  return status === 'open' ? '#2E9E5B' : status === 'caution' ? '#E0A929' : '#D64545'
}

export const riskLabel = (r: number) => r >= 66 ? 'Critical' : r >= 42 ? 'High' : r >= 25 ? 'Moderate' : 'Low'

export function buildAdjacency(): Map<string, { node: string; segId: string }[]> {
  const adj = new Map<string, { node: string; segId: string }[]>()
  for (const seg of SEGMENTS) {
    const a = nodeKey(seg.from), b = nodeKey(seg.to)
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push({ node: b, segId: seg.id })
    adj.get(b)!.push({ node: a, segId: seg.id })
  }
  return adj
}

function nodeKey(name: string) { return name }

export function townOptions() {
  return [...new Set(SEGMENTS.flatMap(s => [s.from, s.to]))].sort()
}

// Optional per-segment cost multiplier, used ONLY to steer the search away
// from a corridor (e.g. finding a genuinely different alternative). It never
// mutates the shared SEGMENTS data and never leaks into the reported route
// stats — distanceKm/timeHours are always computed from real lengths.
type CostScale = ReadonlyMap<string, number>

function dijkstra(
  start: string, end: string, weather: Record<string, WeatherPoint>, season: Season,
  mode: 'safe' | 'fast', cargo: CargoType, excluded: Set<string> = new Set(),
  scale?: CostScale,
): RouteResult | null {
  const segById = new Map(SEGMENTS.map(s => [s.id, s]))
  const congestionCounts = liveCongestionCounts()
  const riskCache = new Map<string, RiskBreakdown>()
  const R = (id: string) => {
    if (!riskCache.has(id)) riskCache.set(id, riskOf(segById.get(id)!, weather, season, congestionCounts))
    return riskCache.get(id)!
  }

  // Roads: blocked = closed; caution holds construction HGVs.
  // Waterways: a stretch is only traversable when it is navigable for the
  // cargo (draft/commodity rule — see data/ner.ts navigableFor) and open.
  const passable = (id: string) => {
    const seg = segById.get(id)!
    if (isWaterway(seg) && !navigableFor(seg, cargo)) return false
    const st = R(id).status
    if (st === 'blocked') return false
    if (st === 'caution' && (cargo === 'construction')) return false
    return true
  }
  const weight = (id: string) => {
    const seg = segById.get(id)!
    const r = R(id)
    const len = seg.lengthKm * (scale?.get(id) ?? 1)
    // Waterway weight includes a large mode-transfer penalty so dijkstra
    // only crosses onto a river when it is genuinely worth it (loading/
    // unloading + schedule delay make water best for bulk/time-flexible).
    const modeFactor = isWaterway(seg) ? 3.4 : 1
    if (mode === 'fast') return len * modeFactor * (1 + r.total / 120)
    return len * modeFactor * (1 + r.total / 40)
  }

  const adj = buildAdjacency()
  const dist = new Map<string, number>()
  const prev = new Map<string, { node: string; segId: string }>()
  const visited = new Set<string>()
  dist.set(start, 0)
  const queue = [start]

  while (queue.length) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))
    const u = queue.shift()!
    if (u === end) break
    if (visited.has(u)) continue
    visited.add(u)
    for (const e of adj.get(u) ?? []) {
      if (excluded.has(e.segId)) continue
      if (!passable(e.segId)) continue
      const nd = (dist.get(u) ?? Infinity) + weight(e.segId)
      if (nd < (dist.get(e.node) ?? Infinity)) {
        dist.set(e.node, nd)
        prev.set(e.node, { node: u, segId: e.segId })
        if (!visited.has(e.node)) queue.push(e.node)
      }
    }
  }

  if (!prev.has(end) && start !== end) return null

  const segIds: string[] = []
  let cur = end
  while (cur !== start) {
    const p = prev.get(cur)
    if (!p) return null
    segIds.unshift(p.segId)
    cur = p.node
  }

  let distanceKm = 0, riskMax = 0
  const coords: [number, number][] = []
  const blockedAhead: string[] = []
  const d2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  for (const id of segIds) {
    const seg = segById.get(id)!
    const r = R(id)
    distanceKm += seg.lengthKm
    riskMax = Math.max(riskMax, r.total)
    // Segments are stored from→to but may be driven to→from on this route;
    // orient each one so the drawn line continues from the previous end
    // instead of jumping back across the map (obvious with real road shapes).
    let c = seg.coords
    if (coords.length && d2(coords[coords.length - 1], c[0]) > d2(coords[coords.length - 1], c[c.length - 1])) c = [...c].reverse()
    coords.push(...(coords.length ? c.slice(1) : c))
    if (r.status !== 'open') blockedAhead.push(seg.name)
  }

  let timeHours = 0
  for (const id of segIds) {
    const seg = segById.get(id)!
    const r = R(id)
    // Barge cruise ~14 km/h vs truck base by terrain; risk still slows it.
    const base = isWaterway(seg) ? 14 : seg.terrain === 'mountain' ? 28 : seg.terrain === 'hilly' ? 34 : 46
    const speed = base * (1 - r.total / 160)
    timeHours += seg.lengthKm / Math.max(6, speed)
  }

  const freeFlow = distanceKm / (segIds.some(id => isWaterway(segById.get(id)!)) ? 40 : 48)
  const delayHours = Math.max(0, Math.round((timeHours - freeFlow) * 10) / 10)
  const delayReason = blockedAhead[0]
    ? `${blockedAhead[0]} — ${segById.get(segIds[0])!.reportReason ?? 'caution/low-speed section'}`
    : riskMax > 42 ? 'Heavy rainfall on hilly stretches reducing speed' : undefined

  return {
    mode, segIds,
    distanceKm: Math.round(distanceKm * 10) / 10,
    timeHours: Math.round(timeHours * 10) / 10,
    riskMax: Math.round(riskMax),
    delayHours, delayReason,
    coords, blockedAhead,
  }
}

// The alternate-route search. Two passes:
//   1. plain fastest route — returned as-is when it genuinely differs from
//      the safest route (mode 'safe' risk-weights far more heavily, so the
//      two usually diverge on the corridor choice);
//   2. when fastest == safest (single-corridor case, or a route where the
//      trade-offs don't change the path), force ONE primary segment out at
//      a time and keep the cheapest genuinely different route found.
//
// IMPORTANT: cost steering uses a per-segment multiplier passed INTO
// dijkstra (CostScale) instead of mutating shared SEGMENTS entries. The old
// implementation temporarily multiplied seg.lengthKm by 3.2 and restored it
// afterwards — which corrupted route stats for concurrent requests AND made
// every such "alternative" report ~3x its true distance/ETA.
export function planRoutes(from: string, to: string, weather: Record<string, WeatherPoint>, season: Season, cargo: CargoType, excludedSegmentIds: string[] = []) {
  const excluded = new Set(excludedSegmentIds)
  const primary = dijkstra(from, to, weather, season, 'safe', cargo, excluded)
  if (!primary) return { primary: null, alternate: null }
  const primaryKey = primary.segIds.join('|')
  const key = (r: RouteResult | null) => (r ? r.segIds.join('|') : null)

  // Pass 1: the straightforward fastest alternative.
  const fast = dijkstra(from, to, weather, season, 'fast', cargo, excluded)
  if (fast && key(fast) !== primaryKey) return { primary, alternate: fast }

  // Pass 2: no naturally different fast route. Probe for real alternatives
  // by removing each primary segment in turn (that segment cannot be on the
  // alternative, so the result is genuinely a different corridor).
  const MAX_ALT_FACTOR = 3 // a "detour" 3x longer stops being an alternative
  let best: RouteResult | null = null
  for (const pid of primary.segIds) {
    const probeExcluded = new Set([...excluded, pid])
    const cand = dijkstra(from, to, weather, season, 'fast', cargo, probeExcluded)
    if (!cand || key(cand) === primaryKey) continue
    if (cand.distanceKm > primary.distanceKm * MAX_ALT_FACTOR) continue
    if (!best || betterAlternate(cand, best, primary.segIds)) best = cand
  }
  return { primary, alternate: best }
}

// Rank alternative candidates: shortest real detour first; when distances
// tie, prefer the corridor that shares the least with the primary route.
function betterAlternate(cand: RouteResult, cur: RouteResult, primarySegIds: string[]): boolean {
  if (cand.distanceKm !== cur.distanceKm) return cand.distanceKm < cur.distanceKm
  const overlap = (r: RouteResult) => r.segIds.filter(id => primarySegIds.includes(id)).length
  return overlap(cand) < overlap(cur)
}

export function convoyWindow(risk: number, segName?: string) {
  if (risk < 55 || !segName) return null
  const depart = new Date(Date.now() + 45 * 60 * 1000)
  const close = new Date(depart.getTime() + 40 * 60 * 1000)
  const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(depart)} – ${fmt(close)}`
}

export function findNearestTown(lat: number, lng: number): string {
  let best = 'Guwahati', bd = Infinity
  for (const [, n] of Object.entries(NODES)) {
    const d = (n.lat - lat) ** 2 + (n.lng - lng) ** 2
    if (d < bd) { bd = d; best = n.name }
  }
  return best
}
