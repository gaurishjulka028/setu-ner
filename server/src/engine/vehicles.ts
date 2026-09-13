// Fleet engine — ONE shared source of truth for every vehicle position.
//
// Two kinds of telemetry feed it, and every position we broadcast says
// which one it came from (Vehicle.telemetry):
//
//   'gps'        a real tracker / driver phone posted a fix through
//                POST /api/vehicles/:id/position (device-token auth). For
//                as long as fixes keep arriving (LIVE_PING_TIMEOUT_MS), the
//                vehicle is driven by them and the simulation is bypassed.
//                Progress along the planned route is inferred from the fix
//                so ETA / remaining km / next-stop still work.
//
//   'simulated'  no device is reporting → the server advances the vehicle
//                along its planned path at its speed on a 4 s tick. This is
//                what the seeded demo fleet runs on. It is clearly labelled
//                in the UI as a simulation.
//
// Part B persistence: realtime.ts snapshots the whole fleet to the Vehicle
// table every N ticks and initFleet() resumes from it.
import type { Vehicle } from '../data/types'
import { VEHICLES, SEGMENTS, NODES } from '../data/ner'
import { prisma } from '../prisma'

const segById = new Map(SEGMENTS.map(s => [s.id, s]))

// Simulation pacing. tick() runs every 4 s; DEMO_TIME_SCALE makes one
// wall-clock second equal that many simulated seconds so a 6-hour
// corridor plays out in a few minutes on stage instead of six hours.
// SIM_TIME_SCALE=1 in server/.env gives real-time pacing.
const TICK_SECONDS = 4
const DEMO_TIME_SCALE = Math.max(1, Number(process.env.SIM_TIME_SCALE) || 20)
const RANDOM_HAZARDS = process.env.SIM_RANDOM_HAZARDS !== 'false'
// Seeded demo vehicles restart their corridor a few minutes after arriving
// (so a long-running demo never ends up with an empty map). Shipments the
// user started (SHIP-*) and GPS-tracked vehicles are never recycled.
const LOOP_SEEDED = process.env.SIM_LOOP_SEEDED !== 'false'
const LOOP_AFTER_MS = 3 * 60 * 1000
const deliveredAt = new Map<string, number>()
const SEED_BY_ID = new Map(VEHICLES.map(v => [v.id, v]))

const hav = (a: [number, number], b: [number, number]) => {
  const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function bearing(a: [number, number], b: [number, number]): number {
  const φ1 = a[0] * Math.PI / 180, φ2 = b[0] * Math.PI / 180, Δλ = (b[1] - a[1]) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Full polyline of a vehicle's path, with cumulative km at each vertex.
// Recomputed per call (not cached) on purpose: engine/geometry.ts may swap
// a segment's coords for real road geometry after boot.
function pathPolyline(v: Vehicle): { pts: [number, number][]; cum: number[]; total: number } {
  const pts: [number, number][] = []
  const cum: number[] = []
  for (const sid of v.path) {
    const s = segById.get(sid)
    if (!s) continue
    // Segments may be traversed in either direction — orient each one so
    // it continues from where the previous one ended.
    let c = s.coords
    if (pts.length && hav(pts[pts.length - 1], c[0]) > hav(pts[pts.length - 1], c[c.length - 1])) c = [...c].reverse()
    // Distance along a segment is measured in ROAD km (seg.lengthKm — the
    // routed distance from OSRM, or the bundled figure), not in straight
    // lines between polyline vertices. A simplified polyline of a winding
    // hill road is 10-30% shorter than the road itself; scaling the vertex
    // spacing keeps the fleet's progress/ETA in step with the route planner
    // (which sums lengthKm) while the marker still rides the drawn line.
    let straight = 0
    for (let i = 1; i < c.length; i++) straight += hav(c[i - 1], c[i])
    const scale = straight > 0 && s.lengthKm > 0 ? s.lengthKm / straight : 1
    for (let i = 0; i < c.length; i++) {
      if (i === 0 && pts.length) continue // shared junction vertex
      const prev = pts[pts.length - 1]
      pts.push(c[i])
      cum.push(prev ? cum[cum.length - 1] + hav(prev, c[i]) * scale : 0)
    }
  }
  if (!cum.length) cum.push(0)
  return { pts, cum, total: cum[cum.length - 1] ?? 0 }
}

export function pathLengthKm(v: Vehicle): number {
  return pathPolyline(v).total
}

function positionAt(v: Vehicle, progKm: number): { lat: number; lng: number; trail: [number, number][]; headingDeg: number } {
  const { pts, cum, total } = pathPolyline(v)
  if (pts.length < 2) return { lat: NODES.GHY.lat, lng: NODES.GHY.lng, trail: [], headingDeg: 0 }
  const target = Math.max(0, Math.min(progKm, total))
  let i = 1
  while (i < cum.length - 1 && cum[i] < target) i++
  const segLen = cum[i] - cum[i - 1] || 1
  const f = Math.max(0, Math.min(1, (target - cum[i - 1]) / segLen))
  const lat = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f
  const lng = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f
  const trail = [...pts.slice(Math.max(0, i - 8), i), [lat, lng] as [number, number]]
  return { lat, lng, trail, headingDeg: Math.round(bearing(pts[i - 1], pts[i])) }
}

// Inverse of positionAt(): the along-route km closest to a GPS fix. Lets a
// live-tracked vehicle keep a meaningful ETA / remaining distance.
function progressFromFix(v: Vehicle, lat: number, lng: number): number {
  const { pts, cum } = pathPolyline(v)
  let best = 0, bestD = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy || 1e-12
    const t = Math.max(0, Math.min(1, ((lat - a[0]) * dx + (lng - a[1]) * dy) / len2))
    const p: [number, number] = [a[0] + dx * t, a[1] + dy * t]
    const d = hav([lat, lng], p)
    if (d < bestD) { bestD = d; best = cum[i - 1] + hav(a, p) }
  }
  return best
}

function withDerived(v: Vehicle, total?: number): Vehicle {
  const len = total ?? pathLengthKm(v)
  const remainingKm = Math.max(0, len - v.progressKm)
  const speed = v.status === 'delayed' ? v.speedKmph * 0.35 : v.speedKmph
  const etaHours = v.status === 'delivered' ? 0 : speed > 0.5 ? remainingKm / speed + (v.status === 'halted' ? v.delayHours : 0) : NaN
  return {
    ...v,
    remainingKm: Math.round(remainingKm * 10) / 10,
    etaHours: Number.isFinite(etaHours) ? Math.round(etaHours * 10) / 10 : undefined,
  }
}

// Live in-memory fleet — one shared array for the whole server process.
let vehicles: Vehicle[] = VEHICLES.map(v => ({ ...v }))

// ── Live GPS ingestion (POST /api/vehicles/:id/position) ──────────────────
const LIVE_PING_TIMEOUT_MS = 30_000
interface LivePing { lat: number; lng: number; speedKmph: number; headingDeg?: number; receivedAt: number }
const lastLivePing = new Map<string, LivePing>()

export function recordLivePosition(vehicleId: string, lat: number, lng: number, speedKmph: number, headingDeg?: number) {
  lastLivePing.set(vehicleId, { lat, lng, speedKmph, headingDeg, receivedAt: Date.now() })
}

function liveOverrideFor(vehicleId: string): LivePing | undefined {
  const ping = lastLivePing.get(vehicleId)
  if (!ping) return undefined
  if (Date.now() - ping.receivedAt > LIVE_PING_TIMEOUT_MS) return undefined
  return ping
}

export function getVehicles(): Vehicle[] { return vehicles }
export function getVehicle(id: string): Vehicle | undefined { return vehicles.find(v => v.id === id) }
export function liveVehicleIds(): string[] { return vehicles.filter(v => liveOverrideFor(v.id)).map(v => v.id) }

// Hooks the alert engine / realtime layer can subscribe to.
type FleetEvent = { type: 'delivered'; vehicle: Vehicle } | { type: 'hazard'; vehicle: Vehicle; reason: string }
const listeners: ((e: FleetEvent) => void)[] = []
export function onFleetEvent(fn: (e: FleetEvent) => void) { listeners.push(fn) }
const emit = (e: FleetEvent) => listeners.forEach(fn => { try { fn(e) } catch (err) { console.error('fleet listener failed:', err) } })

// Seeded deterministic hazard so the demo shows a disruption happening
// live (a moving truck slows to "delayed" on a high-risk stretch) without
// it looking random on every run. Cheap PRNG keyed by tick count.
let tickCount = 0
function maybeHazard(v: Vehicle): Vehicle {
  if (!RANDOM_HAZARDS || v.status !== 'moving' || v.id.startsWith('SHIP-')) return v
  const seg = segById.get(v.path[Math.min(v.path.length - 1, Math.floor((v.progressKm / Math.max(1, pathLengthKm(v))) * v.path.length))])
  if (!seg) return v
  // ~1 event / 8 minutes per vehicle on a poor/caution road, none on good roads.
  const risky = seg.baseCondition === 'poor' || seg.reportedStatus === 'caution' || seg.failureHistory >= 4
  if (!risky) return v
  const h = (Math.imul(tickCount ^ v.id.length * 2654435761, 1597334677) >>> 0) / 4294967296
  if (h > 1 / 120) return v
  const reason = seg.reportedStatus === 'caution' ? `traffic-controlled stretch on ${seg.name}` : `slow going — ${seg.baseCondition} surface on ${seg.name}`
  const next = { ...v, status: 'delayed' as const, delayHours: Math.round((v.delayHours + 0.5 + h * 100) * 10) / 10 }
  emit({ type: 'hazard', vehicle: next, reason })
  return next
}

// One simulation step. `first` = place vehicles without advancing them.
export function tick(first = false): Vehicle[] {
  tickCount++
  const now = Date.now()
  vehicles = vehicles.map(v => {
    const live = liveOverrideFor(v.id)
    if (live) {
      const progressKm = progressFromFix(v, live.lat, live.lng)
      const total = pathLengthKm(v)
      const arrived = total > 0 && total - progressKm < 0.5
      const next: Vehicle = {
        ...v,
        lat: live.lat, lng: live.lng, speedKmph: live.speedKmph, progressKm,
        headingDeg: live.headingDeg ?? v.headingDeg,
        telemetry: 'gps', lastFixAt: live.receivedAt,
        status: arrived ? 'delivered' : v.status === 'delivered' ? 'delivered' : live.speedKmph < 2 ? (v.status === 'moving' ? 'delayed' : v.status) : 'moving',
        trail: [...(v.trail ?? []).slice(-11), [live.lat, live.lng] as [number, number]],
      }
      if (arrived && v.status !== 'delivered') emit({ type: 'delivered', vehicle: next })
      return withDerived(next, total)
    }

    const total = pathLengthKm(v)
    if (v.status === 'delivered') {
      const seed = SEED_BY_ID.get(v.id)
      if (LOOP_SEEDED && seed && !first) {
        const at = deliveredAt.get(v.id) ?? (deliveredAt.set(v.id, now), now)
        if (now - at > LOOP_AFTER_MS) {
          deliveredAt.delete(v.id)
          const fresh: Vehicle = { ...seed, progressKm: 0, status: seed.status === 'halted' ? 'halted' : 'moving', delayHours: seed.status === 'halted' ? seed.delayHours : 0, routeStatus: 'active', replacedRoute: undefined }
          return withDerived({ ...fresh, ...positionAt(fresh, 0), telemetry: 'simulated', lastFixAt: now })
        }
      }
      const pos = positionAt(v, total)
      return withDerived({ ...v, ...pos, telemetry: 'simulated', lastFixAt: now }, total)
    }
    if (v.status === 'halted') {
      const pos = positionAt(v, v.progressKm)
      return withDerived({ ...v, ...pos, telemetry: 'simulated', lastFixAt: now }, total)
    }
    const speedFactor = v.status === 'delayed' ? 0.35 : 1
    const advance = first ? 0 : (v.speedKmph * speedFactor) * (TICK_SECONDS * DEMO_TIME_SCALE) / 3600
    let progressKm = v.progressKm + advance
    let status: Vehicle['status'] = v.status
    if (total > 0 && progressKm >= total - 0.05) {
      progressKm = total
      status = 'delivered'
    }
    const pos = positionAt(v, progressKm)
    let next: Vehicle = { ...v, progressKm, status, ...pos, telemetry: 'simulated', lastFixAt: now }
    if (status === 'delivered') emit({ type: 'delivered', vehicle: next }) // v.status is moving/delayed here
    else if (!first) next = maybeHazard(next)
    return withDerived(next, total)
  })
  return vehicles
}

// Used by PATCH /api/bookings/:id/last-mile to mirror confirmLastMile().
export function markDelivered(vehicleId: string) {
  vehicles = vehicles.map(v => v.id === vehicleId ? { ...v, status: 'delivered' as const, routeStatus: 'active' as const } : v)
}

// ── Shipments started from the app (POST /api/shipments) ─────────────────
export function addVehicle(v: Vehicle): Vehicle {
  const pos = positionAt(v, v.progressKm)
  const placed: Vehicle = withDerived({ ...v, ...pos, telemetry: 'simulated', lastFixAt: Date.now() })
  vehicles = [placed, ...vehicles.filter(x => x.id !== v.id)]
  return placed
}

// Swap a tracked vehicle onto a new corridor (Plan Route → "Apply New
// Route"). Progress restarts on the new path from its first coordinate.
export function replaceRoute(vehicleId: string, path: string[], speedKmph: number, delayHours: number): Vehicle | undefined {
  const cur = vehicles.find(v => v.id === vehicleId)
  if (!cur) return undefined
  const next: Vehicle = {
    ...cur,
    path,
    progressKm: 0,
    speedKmph: speedKmph > 0 ? speedKmph : cur.speedKmph,
    delayHours,
    status: cur.status === 'delivered' ? 'delivered' : 'moving',
    routeStatus: 'replaced',
    replacedRoute: cur.path,
  }
  const placed = withDerived({ ...next, ...positionAt(next, 0), telemetry: 'simulated', lastFixAt: Date.now() })
  vehicles = vehicles.map(v => v.id === vehicleId ? placed : v)
  return placed
}

// Remove a delivered/cancelled shipment from the live fleet + DB.
export async function removeVehicle(vehicleId: string): Promise<boolean> {
  const before = vehicles.length
  vehicles = vehicles.filter(v => v.id !== vehicleId)
  lastLivePing.delete(vehicleId)
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => {})
  return vehicles.length < before
}

// ── Vehicle-table snapshotting (Part B persistence) ───────────────────────
function toDbRow(v: Vehicle) {
  return {
    id: v.id,
    driver: v.driver,
    org: v.org,
    cargo: v.cargo,
    cargoDetail: v.cargoDetail,
    weightT: v.weightT,
    from: v.from,
    to: v.to,
    path: JSON.stringify(v.path),
    progressKm: v.progressKm,
    speedKmph: v.speedKmph,
    status: v.status,
    delayHours: v.delayHours,
    lat: v.lat,
    lng: v.lng,
    trail: JSON.stringify(v.trail),
    routeStatus: v.routeStatus ?? null,
    replacedRoute: v.replacedRoute ? JSON.stringify(v.replacedRoute) : null,
    lastMile: v.lastMile ?? null,
    community: v.community ?? null,
    contact: v.contact ?? null,
  }
}

function fromDbRow(row: {
  id: string; driver: string; org: string; cargo: string; cargoDetail: string
  weightT: number; from: string; to: string; path: string; progressKm: number
  speedKmph: number; status: string; delayHours: number; lat: number; lng: number
  trail: string; routeStatus: string | null; replacedRoute: string | null
  lastMile: boolean | null; community: string | null; contact: string | null
}): Vehicle {
  return {
    id: row.id,
    driver: row.driver,
    org: row.org,
    cargo: row.cargo as Vehicle['cargo'],
    cargoDetail: row.cargoDetail,
    weightT: row.weightT,
    from: row.from,
    to: row.to,
    path: JSON.parse(row.path) as string[],
    progressKm: row.progressKm,
    speedKmph: row.speedKmph,
    status: row.status as Vehicle['status'],
    delayHours: row.delayHours,
    lat: row.lat,
    lng: row.lng,
    trail: JSON.parse(row.trail) as [number, number][],
    routeStatus: (row.routeStatus ?? undefined) as Vehicle['routeStatus'],
    replacedRoute: row.replacedRoute ? JSON.parse(row.replacedRoute) as string[] : undefined,
    lastMile: row.lastMile ?? undefined,
    community: row.community ?? undefined,
    contact: row.contact ?? undefined,
  }
}

// Boot: resume from the last snapshot when one exists, else the seeds.
export async function initFleet(): Promise<void> {
  try {
    const saved = await prisma.vehicle.findMany()
    if (saved.length) {
      const resumed = saved.map(fromDbRow)
      const resumedIds = new Set(resumed.map(v => v.id))
      vehicles = [...resumed, ...VEHICLES.filter(v => !resumedIds.has(v.id)).map(v => ({ ...v }))]
      // A demo fleet that was left running arrives with everything delivered.
      // Reset the SEEDED vehicles (not user shipments) when they've all
      // finished so a restart always has something moving on the map.
      const seeded = vehicles.filter(v => !v.id.startsWith('SHIP-'))
      if (seeded.length && seeded.every(v => v.status === 'delivered')) {
        vehicles = [...vehicles.filter(v => v.id.startsWith('SHIP-')), ...VEHICLES.map(v => ({ ...v }))]
        console.log('initFleet: seeded fleet had all arrived — reset to seed positions')
      }
    }
  } catch (err) {
    console.error('initFleet: could not read persisted vehicles, using seeds:', err)
  }
  tick(true)
}

// Called from realtime.ts every SNAPSHOT_EVERY_TICKS ticks — best-effort.
export async function snapshotFleetToDb(): Promise<void> {
  const fleet = vehicles
  await prisma.$transaction(
    fleet.map(v => prisma.vehicle.upsert({
      where: { id: v.id },
      create: toDbRow(v),
      update: toDbRow(v),
    })),
  )
}

export const simulationInfo = () => ({ timeScale: DEMO_TIME_SCALE, tickSeconds: TICK_SECONDS, randomHazards: RANDOM_HAZARDS, loopSeeded: LOOP_SEEDED, liveVehicles: liveVehicleIds() })
