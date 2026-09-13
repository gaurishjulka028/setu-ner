// ── Real road geometry (Stadia Maps → public OSRM fallback) ─────────────────
//
// The bundled network (setu-ner/src/data/ner.ts) connects real town
// coordinates with SYNTHETIC curves — a deterministic bend between the two
// endpoints. Good enough to draw a graph, but the polyline on the map is
// not the road, and a truck animated along it visibly cuts across terrain.
//
// This module snaps every road segment to the actual highway, caches the
// result in server/data/road-geometry.json, and overlays it onto the shared
// SEGMENTS array that the risk engine, route planner, fleet simulation and
// (via GET /api/segments/geometry + the 'segments:geometry' socket event) the
// frontend all read from.
//
// Providers, tried in this order for every segment:
//
//   1. Stadia Maps Routing API (https://docs.stadiamaps.com/routing/) —
//      Valhalla-based, keyed with STADIA_API_KEY. This is the PRIMARY source:
//      it's a registered/paid service with an SLA and weekly OSM data updates,
//      so the upgrade to full-detail geometry actually completes.
//   2. Public OSRM demo server (router.project-osrm.org, no key). Free and
//      shared, so it is rate-limited, unreliable and blocked on some
//      networks — kept only so a deployment without a Stadia key still works.
//   3. Neither reachable → the synthetic curves stay; `source` says
//      'schematic' and the UI's data-source legend reports that honestly.
//
//  • Cache file present  → applied synchronously at boot, no network needed.
//  • Cache missing/partial/at 'simplified' detail → re-fetched in the
//    background after the server is already listening (never blocks startup);
//    saved + broadcast when done. One request per segment per provider
//    (~40 total), throttled.
//
// Waterways (W* ids) are skipped — neither routing profile has rivers; their
// synthetic geometry already follows the Brahmaputra/Barak roughly.
import fs from 'fs'
import path from 'path'
import { SEGMENTS, NODES, isWaterway } from '../data/ner'
import { serverRoot } from '../prisma'
import { decodePolyline } from '../lib/polyline'

export type GeometrySource = 'stadia' | 'osrm' | 'schematic'
/** The providers we can fetch live road shapes from ('schematic' is never fetched). */
export type LiveGeometrySource = Exclude<GeometrySource, 'schematic'>

export interface SegmentGeometryRow {
  segmentId: string
  coords: [number, number][]
  lengthKm: number
  source: GeometrySource
}

// quality: 'full' = the routing service's highest-detail shape, thinned by
// Douglas-Peucker — every segment we fetch live ourselves, from EITHER
// provider, is recorded as 'full'. 'simplified' = the bundled fallback
// baseline shipped in the repo (fetched once at reduced overview detail) so
// the map is on real roads even with no internet; it only ever describes that
// pre-existing baseline, never a live fetch, and is upgraded to 'full' in the
// background as soon as a provider answers.
type CacheRow = {
  coords: [number, number][]
  lengthKm: number
  quality?: 'full' | 'simplified'
  /** Which provider supplied this row. Absent in pre-Stadia caches → 'osrm'. */
  source?: LiveGeometrySource
}
interface CacheFile {
  fetchedAt: string
  provider: string
  segments: Record<string, CacheRow>
}

const OSRM_BASE = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/+$/, '')
// Server-side Stadia key. Deliberately NOT the VITE_STADIA_API_KEY the client
// bundle ships for tiles — this one never leaves the Node process.
const STADIA_API_KEY = (process.env.STADIA_API_KEY || '').trim()
const STADIA_BASE = (process.env.STADIA_ROUTING_URL || 'https://api.stadiamaps.com').replace(/\/+$/, '')
// 'auto' matches OSRM's driving profile. 'truck' is also valid (and closer to
// what this fleet actually is) but needs vehicle attributes to be worth it.
const STADIA_COSTING = (process.env.STADIA_COSTING || 'auto').trim() || 'auto'
const DISABLED = process.env.ROAD_GEOMETRY_DISABLED === 'true'
const CACHE_PATH = path.resolve(serverRoot(), 'data', 'road-geometry.json')
const REQUEST_GAP_MS = 350 // be polite to shared/free routing services
const HTTP_TIMEOUT_MS = 20_000 // hill corridors are long; allow more than OSRM's 15 s
const USER_AGENT = 'SETU-NER/1.0 (NER logistics prototype)'
// A provider that fails this many times in a row without ever succeeding is
// down or blocked — stop paying its timeout on the remaining 38 segments and
// let the next provider in the chain take over.
const PROVIDER_GIVEUP_AFTER = 2

const sourceById = new Map<string, GeometrySource>()
const qualityById = new Map<string, 'full' | 'simplified'>()
let status: {
  source: GeometrySource
  snapped: number
  total: number
  fullDetail: number
  /** Segment count per provider, so the legend can name the real supplier. */
  byProvider: Record<GeometrySource, number>
  fetchedAt: string | null
  fetching: boolean
  error?: string
} = {
  source: 'schematic', snapped: 0, total: 0, fullDetail: 0,
  byProvider: { stadia: 0, osrm: 0, schematic: 0 }, fetchedAt: null, fetching: false,
}
let onUpdated: (() => void) | null = null

const hav = (a: [number, number], b: [number, number]) => {
  const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Never let the key reach a log line, an error message or a socket payload. */
const redact = (s: string) => (STADIA_API_KEY ? s.split(STADIA_API_KEY).join('***') : s)

function roadSegments() {
  return SEGMENTS.filter(s => !isWaterway(s))
}

function isSnapped(id: string) {
  const s = sourceById.get(id)
  return s === 'osrm' || s === 'stadia'
}

/** The provider chain actually configured, in priority order. */
function providerChain(): LiveGeometrySource[] {
  return STADIA_API_KEY ? ['stadia', 'osrm'] : ['osrm']
}

function stadiaUrl() { return `${STADIA_BASE}/route/v1` }

/** Human-readable description of the chain, for the boot log. */
function describeChain(): string {
  const parts: string[] = []
  if (STADIA_API_KEY) parts.push(`Stadia Maps (${stadiaUrl()}, costing=${STADIA_COSTING})`)
  parts.push(`OSRM (${OSRM_BASE})`)
  return parts.join(' → ')
}

function applyRow(
  id: string,
  coords: [number, number][],
  lengthKm: number,
  quality: 'full' | 'simplified' = 'full',
  source: LiveGeometrySource = 'osrm',
) {
  const seg = SEGMENTS.find(s => s.id === id)
  if (!seg || coords.length < 2) return false
  seg.coords = coords
  seg.lengthKm = Math.round(lengthKm * 10) / 10
  seg.geometrySource = source
  sourceById.set(id, source)
  qualityById.set(id, quality)
  return true
}

function recomputeStatus(fetchedAt: string | null) {
  const roads = roadSegments()
  const byProvider: Record<GeometrySource, number> = { stadia: 0, osrm: 0, schematic: 0 }
  for (const s of roads) byProvider[sourceById.get(s.id) ?? 'schematic']++
  const snapped = byProvider.stadia + byProvider.osrm
  const fullDetail = roads.filter(s => qualityById.get(s.id) === 'full').length
  // 'schematic' unless EVERY road corridor is on real geometry, so the
  // legend's green dot keeps meaning "the whole map follows real roads".
  // When all are snapped, name the provider that supplied the most of them.
  const source: GeometrySource = snapped === roads.length && roads.length > 0
    ? (byProvider.stadia >= byProvider.osrm ? 'stadia' : 'osrm')
    : 'schematic'
  status = { ...status, source, snapped, total: roads.length, fullDetail, byProvider, fetchedAt }
}

// Reads server/data/road-geometry.json (if any) into SEGMENTS. Sync, so it
// can run before the fleet is placed on the roads.
export function loadRoadGeometryCache(): void {
  try {
    if (!fs.existsSync(CACHE_PATH)) { recomputeStatus(null); return }
    const file = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as CacheFile
    let applied = 0
    for (const [id, row] of Object.entries(file.segments ?? {})) {
      // Rows written before Stadia support carry no `source`; they came from
      // OSRM, so that's the honest default.
      if (applyRow(id, row.coords, row.lengthKm, row.quality ?? 'full', row.source ?? 'osrm')) applied++
    }
    recomputeStatus(file.fetchedAt ?? null)
    const simplified = [...qualityById.values()].filter(q => q === 'simplified').length
    const from = status.byProvider.stadia ? ` — ${status.byProvider.stadia} from Stadia Maps` : ''
    console.log(`[geometry] ${applied}/${roadSegments().length} road segments loaded from cache (${path.relative(serverRoot(), CACHE_PATH)})${from}${simplified ? ` — ${simplified} at reduced detail, upgrading in background when online` : ''}`)
  } catch (err) {
    console.warn('[geometry] cache unreadable, using schematic geometry:', (err as Error).message)
    recomputeStatus(null)
  }
}

// Douglas-Peucker simplification (~40 m tolerance) so a 300 km highway is
// a few hundred vertices instead of several thousand — payload size for 40
// segments x every socket client — without cutting corners on hairpins the
// way every-Nth sampling does. Endpoints are always kept; a hard cap guards
// against pathological inputs.
// Defaults are driver-grade: 8 m tolerance keeps every real bend of a hill
// road (a 40 m tolerance visibly cut hairpins on NH-6/NH-2 at zoom 14+),
// and 2 500 points is well below what Leaflet handles per polyline. Both are
// overridable via GEOMETRY_THIN_TOLERANCE_M / GEOMETRY_MAX_POINTS.
const THIN_TOLERANCE_KM = Math.max(0.001, Number(process.env.GEOMETRY_THIN_TOLERANCE_M ?? 8) / 1000)
const THIN_MAX_POINTS = Math.max(50, Number(process.env.GEOMETRY_MAX_POINTS ?? 2500))

function thin(points: [number, number][], toleranceKm = THIN_TOLERANCE_KM, maxPoints = THIN_MAX_POINTS): [number, number][] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  // perpendicular distance (km, equirectangular — fine at this scale)
  const dist = (p: [number, number], a: [number, number], b: [number, number]) => {
    const kx = 111.32 * Math.cos((a[0] * Math.PI) / 180), ky = 110.57
    const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky, bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky
    const len2 = bx * bx + by * by
    const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0
    const dx = px - t * bx, dy = py - t * by
    return Math.sqrt(dx * dx + dy * dy)
  }
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = dist(points[i], points[s], points[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (idx > 0 && maxD > toleranceKm) { keep[idx] = 1; stack.push([s, idx], [idx, e]) }
  }
  let out = points.filter((_, i) => keep[i])
  if (out.length > maxPoints) {
    const step = (out.length - 1) / (maxPoints - 1)
    const capped: [number, number][] = []
    for (let i = 0; i < maxPoints; i++) capped.push(out[Math.round(i * step)])
    capped[capped.length - 1] = out[out.length - 1]
    out = capped
  }
  return out
}

// Valhalla hands back the shape as an encoded polyline6 string. That is the
// only option here: the live Stadia endpoint rejects `shape_format:"geojson"`
// with `400 unknown variant "geojson", expected "polyline6" or "polyline5"`,
// so the shape always needs decoding on our side. The GeoJSON-LineString
// branch is defensive only — for a self-hosted Valhalla pointed at via
// STADIA_ROUTING_URL that does honour it. Either way we return our internal
// [lat, lng] order.
function shapeToLatLng(shape: unknown): [number, number][] {
  if (typeof shape === 'string' && shape.length) return decodePolyline(shape, 6)
  if (shape && typeof shape === 'object') {
    const coords = (shape as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords)) {
      return coords
        .map(c => [Number((c as number[])[1]), Number((c as number[])[0])] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    }
  }
  return []
}

// Concatenate per-leg shapes into one polyline. Adjacent legs share their
// boundary vertex, so skip the duplicate.
function joinShapes(shapes: unknown[]): [number, number][] {
  const out: [number, number][] = []
  for (const shape of shapes) {
    const pts = shapeToLatLng(shape)
    const start = out.length > 0 && pts.length > 0 ? 1 : 0
    for (let i = start; i < pts.length; i++) out.push(pts[i])
  }
  return out
}

// Shared tail for both providers: pin the graph's node coordinates as exact
// endpoints so vehicles start and end on the town marker (not on the nearest
// snapped road point), then simplify. Length falls back to the polyline's own
// length if the provider didn't report a usable one.
function finishRoute(
  latlng: [number, number][],
  lengthKm: number,
  a: [number, number],
  b: [number, number],
): { coords: [number, number][]; lengthKm: number } | null {
  if (latlng.length < 2) return null
  latlng[0] = a
  latlng[latlng.length - 1] = b
  const km = Number.isFinite(lengthKm) && lengthKm > 0 ? lengthKm : polylineKm(latlng)
  return { coords: thin(latlng), lengthKm: km }
}

// ── Provider 1: Stadia Maps Routing API (Valhalla) ─────────────────────────
//
// POST https://api.stadiamaps.com/route/v1  (docs.stadiamaps.com/routing/)
// Body: { locations: [{lat, lon}, …], costing, units, directions_type,
//         format, shape_format }
// We ask for `format: "osrm"`, which returns an OSRM-compatible envelope
// (verified against the live API):
//   { "routes": [{ "distance": 27547.25,   // METRES (OSRM convention)
//                  "duration": 1452.75,
//                  "geometry": "_mznm@sibxnD…" }],   // encoded polyline6
//     "waypoints": [{ "location": [lon, lat], … }],
//     "code": "Ok" }
// The native Valhalla envelope ({ trip: { legs: [{ shape }], summary:
// { length } } }, length in the requested `units`) is parsed too, so the
// integration keeps working if `format` is ever ignored.
type StadiaOsrmRoute = { distance?: number; duration?: number; geometry?: unknown }
type StadiaResponse = {
  code?: string
  routes?: StadiaOsrmRoute[]
  trip?: {
    status?: number
    status_message?: string
    units?: string
    summary?: { length?: number }
    legs?: { shape?: unknown; summary?: { length?: number } }[]
  }
  error?: { reason?: string }
  status?: number
}

// Auth: the `api_key` query parameter (the form Stadia's own SDKs use). If a
// deployment rejects it we retry once with the documented
// `Authorization: Stadia-Auth <key>` header. The URL is never logged — it
// carries the key — and any response text we do surface goes through
// `redact()`.
async function postStadiaRoute(body: unknown): Promise<StadiaResponse> {
  const attempts: { url: string; headers: Record<string, string> }[] = [
    { url: `${stadiaUrl()}?api_key=${encodeURIComponent(STADIA_API_KEY)}`, headers: {} },
    { url: stadiaUrl(), headers: { Authorization: `Stadia-Auth ${STADIA_API_KEY}` } },
  ]
  let lastAuthError: Error | null = null
  for (const attempt of attempts) {
    const ctrl = new AbortController() // fresh per attempt: a timed-out signal can't be reused
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, ...attempt.headers },
        body: JSON.stringify(body),
      })
      if (res.status === 401 || res.status === 403) {
        lastAuthError = new Error(`Stadia auth rejected (${res.status})`)
        continue
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Stadia ${res.status}${detail ? ` — ${redact(detail).slice(0, 200)}` : ''}`)
      }
      return await res.json() as StadiaResponse
    } finally {
      clearTimeout(t)
    }
  }
  throw lastAuthError ?? new Error('Stadia auth rejected')
}

/**
 * Fetch one segment's real road shape from Stadia Maps.
 * Returns the same `{ coords, lengthKm }` shape `fetchOne()` (OSRM) does, or
 * null when Stadia is unavailable / has no route — so the caller can fall
 * through to the next provider.
 */
export async function fetchOneFromStadia(
  segId: string,
  a: [number, number],
  b: [number, number],
): Promise<{ coords: [number, number][]; lengthKm: number } | null> {
  if (!STADIA_API_KEY) return null
  try {
    const data = await postStadiaRoute({
      id: segId,
      locations: [
        { lat: a[0], lon: a[1], type: 'break' },
        { lat: b[0], lon: b[1], type: 'break' },
      ],
      costing: STADIA_COSTING,
      units: 'kilometers',
      // We only want the shape — no maneuvers, no narration. Much smaller
      // response for a 300 km corridor.
      directions_type: 'none',
      format: 'osrm',
      // geojson is NOT a valid shape_format here (400 unknown variant);
      // polyline6 is the default and what we decode.
      shape_format: 'polyline6',
    })

    let latlng: [number, number][] = []
    let lengthKm = 0

    if (data.error?.reason) throw new Error(`Stadia ${data.error.reason}`)
    if (Array.isArray(data.routes)) {
      if (data.code && data.code !== 'Ok') throw new Error(`Stadia ${data.code}`)
      const route = data.routes[0]
      if (!route) throw new Error('Stadia returned no route')
      latlng = joinShapes([route.geometry])
      lengthKm = typeof route.distance === 'number' ? route.distance / 1000 : 0 // metres → km
    } else if (data.trip) {
      const trip = data.trip
      if (typeof trip.status === 'number' && trip.status !== 0) {
        throw new Error(`Stadia ${trip.status_message ?? `status ${trip.status}`}`)
      }
      latlng = joinShapes((trip.legs ?? []).map(l => l.shape))
      // `summary.length` is in the requested `units` (kilometres).
      lengthKm = trip.summary?.length ?? (trip.legs ?? []).reduce((n, l) => n + (l.summary?.length ?? 0), 0)
    } else {
      throw new Error(`Stadia unrecognised response: ${redact(JSON.stringify(data)).slice(0, 160)}`)
    }

    const out = finishRoute(latlng, lengthKm, a, b)
    if (!out) throw new Error('Stadia returned no shape')
    return out
  } catch (err) {
    console.warn(`[geometry] ${segId}: ${(err as Error).message}`)
    return null
  }
}

// ── Provider 2: public OSRM demo server ────────────────────────────────────
async function fetchOne(segId: string, a: [number, number], b: [number, number]): Promise<{ coords: [number, number][]; lengthKm: number } | null> {
  const url = `${OSRM_BASE}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson&steps=false`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json() as { code?: string; routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] }
    const route = data.routes?.[0]
    if (data.code !== 'Ok' || !route) throw new Error(`OSRM ${data.code ?? 'no route'}`)
    const latlng = route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
    const out = finishRoute(latlng, route.distance / 1000, a, b)
    if (!out) throw new Error('OSRM returned no shape')
    return out
  } catch (err) {
    console.warn(`[geometry] ${segId}: ${(err as Error).message}`)
    return null
  } finally {
    clearTimeout(t)
  }
}

function saveCache(rows: Record<string, CacheRow>) {
  // Name whichever provider actually supplied most of this file, so the
  // cache's own metadata stays honest about its contents.
  let stadia = 0, osrm = 0
  for (const r of Object.values(rows)) (r.source ?? 'osrm') === 'stadia' ? stadia++ : osrm++
  const provider = stadia > 0 && stadia >= osrm ? stadiaUrl() : OSRM_BASE
  const file: CacheFile = { fetchedAt: new Date().toISOString(), provider, segments: rows }
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(file))
}

// A segment's endpoints: the town node coordinates when we know them, else
// the ends of whatever geometry it currently has.
function endpoints(seg: { from: string; to: string; coords: [number, number][] }) {
  const A = NODES[Object.keys(NODES).find(k => NODES[k].name === seg.from) ?? '']
  const B = NODES[Object.keys(NODES).find(k => NODES[k].name === seg.to) ?? '']
  const a: [number, number] = A ? [A.lat, A.lng] : seg.coords[0]
  const b: [number, number] = B ? [B.lat, B.lng] : seg.coords[seg.coords.length - 1]
  return { a, b }
}

// Fetch geometry for every road segment that isn't already snapped at full
// detail. Safe to call repeatedly (no-op while a run is in progress).
// Returns how many segments were newly snapped.
export async function refreshRoadGeometry(force = false): Promise<number> {
  if (DISABLED || status.fetching) return 0
  const todo = roadSegments().filter(s => force || !isSnapped(s.id) || qualityById.get(s.id) === 'simplified')
  if (!todo.length) return 0
  status = { ...status, fetching: true, error: undefined }
  const chain = providerChain()
  console.log(`[geometry] snapping ${todo.length} road segment(s) to real roads via ${describeChain()} …`)

  let cached: CacheFile['segments'] = {}
  try { if (fs.existsSync(CACHE_PATH)) cached = (JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as CacheFile).segments ?? {} } catch { /* start fresh */ }

  // Per-provider circuit breaker: consecutive misses since that provider last
  // succeeded. Without it a dead primary costs 40 x HTTP_TIMEOUT_MS before
  // the fallback ever gets a turn.
  const misses: Record<LiveGeometrySource, number> = { stadia: 0, osrm: 0 }
  const gaveUp = new Set<LiveGeometrySource>()

  let done = 0, failed = 0
  for (const seg of todo) {
    const { a, b } = endpoints(seg)
    let row: { coords: [number, number][]; lengthKm: number; source: LiveGeometrySource } | null = null

    for (const provider of chain) {
      if (gaveUp.has(provider)) continue
      const fetched = provider === 'stadia'
        ? await fetchOneFromStadia(seg.id, a, b)
        : await fetchOne(seg.id, a, b)
      if (fetched) { row = { ...fetched, source: provider }; break }
      misses[provider]++
      if (misses[provider] >= PROVIDER_GIVEUP_AFTER) {
        gaveUp.add(provider)
        console.warn(`[geometry] ${provider} failed ${misses[provider]}x in a row — not using it for the rest of this run`)
      }
    }

    if (row) {
      // Any live fetch is full detail, from either provider. 'simplified'
      // only ever describes the bundled pre-fetch baseline.
      applyRow(seg.id, row.coords, row.lengthKm, 'full', row.source)
      cached[seg.id] = { coords: row.coords, lengthKm: row.lengthKm, quality: 'full', source: row.source }
      misses[row.source] = 0
      done++
    } else {
      failed++
      // First failure is almost always "no internet" — don't hammer 39 more times.
      if ((done === 0 && failed >= 2) || gaveUp.size === chain.length) {
        status.error = 'routing services unreachable'
        break
      }
    }
    await new Promise(r => setTimeout(r, REQUEST_GAP_MS))
  }
  if (done) {
    try { saveCache(cached) } catch (err) { console.warn('[geometry] could not write cache:', (err as Error).message) }
  }
  recomputeStatus(done ? new Date().toISOString() : status.fetchedAt)
  status = { ...status, fetching: false }
  const perProvider = [`Stadia ${status.byProvider.stadia}`, `OSRM ${status.byProvider.osrm}`].join(', ')
  console.log(`[geometry] done — ${status.snapped}/${status.total} road segments on real geometry (${perProvider}), ${status.fullDetail} at full detail${failed ? ` (${failed} failed)` : ''}`)
  if (done) onUpdated?.()
  return done
}

// realtime.ts registers a broadcaster here so clients get the new shapes
// the moment a background fetch completes.
export function onGeometryUpdated(fn: () => void) { onUpdated = fn }

export function currentGeometry(): SegmentGeometryRow[] {
  return SEGMENTS.map(s => ({
    segmentId: s.id,
    coords: s.coords,
    lengthKm: s.lengthKm,
    source: isWaterway(s) ? 'schematic' : (sourceById.get(s.id) ?? 'schematic'),
  }))
}

export function geometryStatus() {
  return {
    ...status,
    // The endpoint a refresh would hit first, plus what it falls back to.
    provider: STADIA_API_KEY ? stadiaUrl() : OSRM_BASE,
    fallback: STADIA_API_KEY ? OSRM_BASE : null,
    stadiaKeyConfigured: Boolean(STADIA_API_KEY),
    costing: STADIA_COSTING,
    disabled: DISABLED,
  }
}

// Recompute a segment's length from its coordinates — used by tests/tools.
export function polylineKm(coords: [number, number][]): number {
  let km = 0
  for (let i = 1; i < coords.length; i++) km += hav(coords[i - 1], coords[i])
  return km
}
