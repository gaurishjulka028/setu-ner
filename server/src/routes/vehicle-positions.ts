import { Router } from 'express'
import { z } from 'zod'
import { requireDeviceToken, deviceTokenFor } from '../middleware/deviceAuth'
import { requireAuth, requireRole } from '../middleware/auth'
import { getVehicle, recordLivePosition, liveVehicleIds, simulationInfo } from '../engine/vehicles'
import { broadcastVehicles } from '../realtime'

const router = Router()

const fixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmph: z.number().min(0).max(200),
  headingDeg: z.number().min(0).max(360).optional(),
  ts: z.number().optional(), // accepted for future out-of-order detection
})

function ingest(id: string, body: unknown, res: import('express').Response) {
  const vehicle = getVehicle(id)
  if (!vehicle) return res.status(404).json({ error: `No vehicle with id ${id}` })
  const parsed = fixSchema.safeParse(body)
  if (!parsed.success) return res.status(400).json({ error: 'Body must include numeric lat, lng, speedKmph (headingDeg optional)', details: parsed.error.flatten() })
  const { lat, lng, speedKmph, headingDeg } = parsed.data
  recordLivePosition(id, lat, lng, speedKmph, headingDeg)
  // Push immediately so the map reflects the real fix without waiting up
  // to 4 s for the next tick (the tick will still fold it into ETA etc.).
  broadcastVehicles()
  res.json({ ok: true, vehicleId: id, live: true, telemetry: 'gps' })
}

// POST /api/vehicles/:id/position — hardware tracker ingestion.
// Auth: x-device-token header (middleware/deviceAuth.ts), NOT the user JWT.
router.post('/vehicles/:id/position', requireDeviceToken, (req, res) => ingest(req.params.id, req.body, res))

// POST /api/vehicles/:id/position/driver — same ingestion, but authenticated
// as a logged-in app user (operator/logistics/official/admin). This is how
// the "Share my live location" button on the Track screen turns a driver's
// phone into the tracker — no hardware needed for a real GPS demo.
router.post('/vehicles/:id/position/driver', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), (req, res) => ingest(req.params.id, req.body, res))

// ── Hardware / app trackers speaking the OsmAnd (Traccar-client) protocol ──
//
// Nearly every GPS tracking app (Traccar Client, OsmAnd, GPSLogger, Owntracks
// in HTTP mode) and a lot of SIM-based vehicle trackers can be pointed at a
// plain HTTP URL and will send fixes as query parameters:
//
//   GET|POST /api/tracker/osmand?id=<deviceId>&lat=..&lon=..&speed=..&bearing=..&timestamp=..
//
// `id` is the vehicle id (e.g. AS01AB1234). Authentication is the same
// per-vehicle device token as /vehicles/:id/position, supplied either as
// the `token` query param (apps only let you set a URL) or x-device-token.
//   Traccar Client: Server URL = https://<host>/api/tracker/osmand?token=<token>
//                   Device identifier = <vehicle id>
// `speed` is in KNOTS in the OsmAnd protocol; we convert to km/h.
const osmandSchema = z.object({
  id: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  speed: z.coerce.number().min(0).optional(),      // knots
  bearing: z.coerce.number().min(0).max(360).optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  timestamp: z.coerce.number().optional(),          // unix seconds
  token: z.string().optional(),
})
function osmand(req: import('express').Request, res: import('express').Response) {
  // Traccar Client POSTs form-encoded params; some trackers GET them.
  const src = { ...(req.query as Record<string, unknown>), ...((typeof req.body === 'object' && req.body) || {}) }
  const parsed = osmandSchema.safeParse(src)
  if (!parsed.success) return res.status(400).json({ error: 'Expected id, lat, lon (and optionally speed, bearing, timestamp, token)', details: parsed.error.flatten() })
  const { id, lat, lon, speed, bearing, heading, timestamp, token } = parsed.data
  const supplied = token ?? (typeof req.headers['x-device-token'] === 'string' ? req.headers['x-device-token'] : '')
  if (!supplied || supplied !== deviceTokenFor(id)) return res.status(401).json({ error: 'Invalid or missing device token for this vehicle (pass ?token=… or x-device-token)' })
  return ingest(id, {
    lat, lng: lon,
    speedKmph: Math.min(200, Math.round((speed ?? 0) * 1.852 * 10) / 10),
    headingDeg: bearing ?? heading,
    ts: timestamp ? timestamp * 1000 : undefined,
  }, res)
}
router.get('/tracker/osmand', osmand)
router.post('/tracker/osmand', osmand)

// GET /api/vehicles/:id/device-token — officials/admins can read the device
// token for a vehicle to provision a tracker (or to try the curl example in
// server/README.md) without computing the HMAC by hand.
router.get('/vehicles/:id/device-token', requireAuth, requireRole('official', 'admin'), (req, res) => {
  if (!getVehicle(req.params.id)) return res.status(404).json({ error: `No vehicle with id ${req.params.id}` })
  const token = deviceTokenFor(req.params.id)
  const origin = `${req.protocol}://${req.get('host')}`
  res.json({
    vehicleId: req.params.id, token, header: 'x-device-token',
    endpoint: `/api/vehicles/${req.params.id}/position`,
    // Ready-to-paste settings for phone tracker apps / SIM trackers.
    osmand: { serverUrl: `${origin}/api/tracker/osmand?token=${token}`, deviceIdentifier: req.params.id },
  })
})

// GET /api/vehicles/telemetry — which vehicles are on real GPS right now and
// how the simulation is paced. Public; feeds the map legend.
router.get('/vehicles/telemetry', (_req, res) => {
  res.json({ ...simulationInfo(), liveVehicles: liveVehicleIds() })
})

export default router
