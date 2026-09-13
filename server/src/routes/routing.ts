import { Router } from 'express'
import { z } from 'zod'
import { SEGMENTS, NODES, DISTRICTS } from '../data/ner'
import { planRoutes, riskOf, liveCongestionCounts } from '../engine/risk'
import { getRegionWeather } from '../engine/weather'
import { currentSegmentStatuses } from '../engine/segments'
import { currentGeometry, geometryStatus, refreshRoadGeometry } from '../engine/geometry'
import { requireAuth, requireRole } from '../middleware/auth'
import type { CargoType, Season } from '../data/types'

const router = Router()

const CARGO_TYPES: CargoType[] = ['medicine', 'food', 'fuel', 'construction', 'agri', 'relief', 'pharma']
const SEASONS: Season[] = ['monsoon', 'dry']

const routeSuggestionSchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  cargo: z.enum(CARGO_TYPES as [CargoType, ...CargoType[]]),
  season: z.enum(SEASONS as [Season, ...Season[]]).optional(),
  excludeSegmentIds: z.array(z.string()).optional(),
})

// The graph is keyed by town name ("Guwahati"). Accept that, a district /
// node code ("GHY"), or a district HQ name, case-insensitively, so the
// same endpoint works for the PlanRoute UI, bookings (district ids) and
// hand-written API calls.
function resolveNode(input: string): string | null {
  const q = input.trim().toLowerCase()
  if (!q) return null
  for (const [code, n] of Object.entries(NODES)) {
    if (n.name.toLowerCase() === q || code.toLowerCase() === q) return n.name
  }
  const d = DISTRICTS.find(d => d.id.toLowerCase() === q || d.hq.toLowerCase() === q || d.name.toLowerCase() === q)
  if (d && NODES[d.id]) return NODES[d.id].name
  return null
}

// POST /api/route-suggestion — { origin, destination, cargo } in,
// { primary, alternate } RouteResult out. Wraps planRoutes() exactly as
// PlanRoute.tsx called it client-side (setu-ner/src/lib/risk.ts).
router.post('/route-suggestion', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), async (req, res) => {
  const parsed = routeSuggestionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'origin, destination and cargo are required', details: parsed.error.flatten() })
  }
  const { cargo, season = 'monsoon', excludeSegmentIds = [] } = parsed.data
  const origin = resolveNode(parsed.data.origin)
  const destination = resolveNode(parsed.data.destination)
  if (!origin || !destination) {
    return res.status(400).json({
      error: `Unknown ${!origin ? 'origin' : 'destination'} "${!origin ? parsed.data.origin : parsed.data.destination}"`,
      hint: 'Use a network town name (e.g. "Guwahati") or district code (e.g. "GHY")',
      knownNodes: Object.values(NODES).map(n => n.name),
    })
  }
  if (origin === destination) {
    return res.status(400).json({ error: 'origin and destination must be different' })
  }
  const weather = await getRegionWeather()
  const result = planRoutes(origin, destination, weather, season, cargo, excludeSegmentIds)
  res.json(result)
})

// GET /api/segments/risk — current risk score per segment, for the map
// overlay. Same riskOf() model as PlanRoute/Dashboard used client-side.
router.get('/segments/risk', async (req, res) => {
  const season: Season = req.query.season === 'dry' ? 'dry' : 'monsoon'
  const weather = await getRegionWeather()
  const congestionCounts = liveCongestionCounts()
  const risks = SEGMENTS.map(seg => ({ segmentId: seg.id, ...riskOf(seg, weather, season, congestionCounts) }))
  res.json(risks)
})

// GET /api/segments/status — report-driven road statuses (blocked/caution
// + reason). Public. The frontend bundles its own copy of the segment
// dataset for offline use; it overlays these on top so map colours, the
// route planner's exclusion list and the chatbot all agree with the server.
router.get('/segments/status', (_req, res) => {
  res.json(currentSegmentStatuses())
})

// GET /api/segments/geometry — the polyline for every segment, plus where
// it came from ('stadia' = snapped to the real road via the Stadia Maps
// routing API, 'osrm' = snapped via the public OSRM router — both are real
// OpenStreetMap geometry, 'schematic' = the bundled synthetic curve).
// Public. The frontend overlays these on its bundled SEGMENTS at startup
// and on the 'segments:geometry' socket event.
router.get('/segments/geometry', (_req, res) => {
  res.json({ status: geometryStatus(), segments: currentGeometry() })
})

// POST /api/segments/geometry/refresh — officials/admins can (re)trigger the
// road snap (Stadia Maps first, public OSRM as fallback), e.g. after the
// venue network comes up or after STADIA_API_KEY is added. Runs in the
// background; clients get the result over the socket. `force: true`
// re-fetches every road segment, including ones already at full detail.
// Same thing headlessly: `npx tsx scripts/refresh-geometry.ts --force`.
router.post('/segments/geometry/refresh', requireAuth, requireRole('official', 'admin'), (req, res) => {
  const force = req.body?.force === true
  refreshRoadGeometry(force).catch(err => console.error('[geometry] refresh failed:', err))
  res.status(202).json({ started: true, status: geometryStatus() })
})

export default router
