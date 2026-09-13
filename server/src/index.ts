import 'dotenv/config'
import http from 'http'
import express from 'express'
import compression from 'compression'
import './lib/asyncRoutes' // must come before any router is imported
import cors from 'cors'
import authRoutes from './routes/auth'
import referenceRoutes from './routes/reference'
import guardedExampleRoutes from './routes/guarded-examples'
import weatherRoutes from './routes/weather'
import routingRoutes from './routes/routing'
import vehiclesRoutes from './routes/vehicles'
import vehiclePositionsRoutes from './routes/vehicle-positions'
import govtFeedRoutes from './routes/govt-feed'
import reportsRoutes from './routes/reports'
import alertsRoutes from './routes/alerts'
import bookingsRoutes from './routes/bookings'
import shipmentsRoutes from './routes/shipments'
import systemRoutes, { getDisasterState } from './routes/system'
import stockRoutes from './routes/stock'
import whatsappRoutes from './routes/whatsapp'
import analysisRoutes from './routes/analysis'
import { attachRealtime, primeSystemState, dataSources } from './realtime'
import { uploadsRoot } from './lib/uploads'
import { initFleet } from './engine/vehicles'
import { loadSegmentStatuses } from './engine/segments'
import { loadRoadGeometryCache, refreshRoadGeometry } from './engine/geometry'
import { getRegionWeather } from './engine/weather'
import { getGovtAlerts } from './integrations/govtAlerts'
import { waConfig } from './lib/whatsapp'

const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
// Full-detail road geometry is ~0.8 MB of JSON; gzip cuts it ~5x for phones.
app.use(compression())
app.use(express.json())
app.use(express.urlencoded({ extended: false })) // Traccar-client / OsmAnd trackers POST form-encoded fixes

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// What on the map/dashboard is live right now vs bundled/simulated — the
// honest answer for judges, and what the UI's data-source legend shows.
app.get('/api/data-sources', async (_req, res) => {
  const govt = await getGovtAlerts().then(g => ({ live: g.live, fetchedAt: g.fetchedAt, count: g.alerts.length })).catch(() => ({ live: false, fetchedAt: null, count: 0 }))
  res.json({ ...dataSources(), govtAlerts: govt, whatsapp: waConfig() })
})

// Incident photos land here (POST /api/reports/photo → server/uploads).
// Served unauthenticated for the prototype so field photos are directly
// viewable in browsers; production upgrade: signed/expiring URLs in front
// of the same directory (see lib/uploads.ts).
app.use('/uploads', express.static(uploadsRoot(), { maxAge: '7d', immutable: true }))

app.use('/api/auth', authRoutes)
app.use('/api', referenceRoutes)
app.use('/api', guardedExampleRoutes)
app.use('/api', weatherRoutes)
app.use('/api', routingRoutes)
app.use('/api', vehiclesRoutes)
app.use('/api', vehiclePositionsRoutes)
app.use('/api', govtFeedRoutes)
app.use('/api', reportsRoutes)
app.use('/api', alertsRoutes)
app.use('/api', bookingsRoutes)
app.use('/api', shipmentsRoutes)
app.use('/api', systemRoutes)
app.use('/api', stockRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api', analysisRoutes)

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
})

// Central error handler: Express 4 does not catch rejected promises from
// async handlers on its own — without this, any thrown error (bad DB file,
// missing migration, etc.) leaves the request hanging with no response and
// the frontend shows a generic "failed to fetch". Now it's a JSON 500 with
// the message, and the stack is logged server-side.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = err as { status?: number; statusCode?: number; message?: string; type?: string }
  const status = e.status ?? e.statusCode ?? 500
  if (status >= 500) console.error('[api] unhandled error:', err)
  res.status(status).json({ error: e.message || 'Internal server error' })
})

const PORT = Number(process.env.PORT) || 4000

async function main() {
  // Resume the simulated fleet from the last DB snapshot before the first
  // socket push/tick (see engine/vehicles.ts — Part B persistence).
  // Report-driven road closures live in the DB; load them into the shared
  // SEGMENTS array before the risk/route engines serve their first request.
  await loadSegmentStatuses()
  // Real road shapes from the on-disk OSRM cache (sync, no network) so the
  // fleet is placed on actual highways before the first tick.
  loadRoadGeometryCache()
  await initFleet()
  primeSystemState({ disasterMode: await getDisasterState() })

  const httpServer = http.createServer(app)
  attachRealtime(httpServer) // Socket.IO channel at /ws/vehicles

  httpServer.listen(PORT, () => {
    console.log(`SETU-NER API listening on http://localhost:${PORT}`)
    console.log(`Vehicle position socket at ws://localhost:${PORT}/ws/vehicles`)
    console.log(`Incident photos served from http://localhost:${PORT}/uploads/photos/`)
    console.log(`WhatsApp transport: ${waConfig().transport}`)
  })

  // Background warm-ups — never block startup, never fatal. Any segment
  // still on schematic geometry gets snapped to real roads (and cached)
  // as soon as the network allows; weather + official alerts are primed so
  // the first page load already shows live data instead of fallbacks.
  setTimeout(() => {
    refreshRoadGeometry().catch(err => console.warn('[geometry] background snap failed:', err))
    getRegionWeather().catch(() => {})
    getGovtAlerts().catch(() => {})
  }, 1500)
}

main().catch(err => {
  console.error('Failed to start SETU-NER API:', err)
  process.exit(1)
})
