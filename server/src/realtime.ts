import { Server as IOServer } from 'socket.io'
import type { Server as HTTPServer } from 'http'
import { tick, getVehicles, snapshotFleetToDb, onFleetEvent } from './engine/vehicles'
import { runAlertGeneration, pushFleetAlert } from './engine/alerts'
import { currentSegmentStatuses } from './engine/segments'
import { currentGeometry, geometryStatus, onGeometryUpdated } from './engine/geometry'
import { getRegionWeather, weatherStatus } from './engine/weather'
import { waConfig, waOutbox, setWaChangeListener } from './lib/whatsapp'

// Same 4s cadence as the interval that used to drive tick() client-side
// in App.tsx (setInterval(() => tick(), 4000)) — now the one source of
// truth every connected tab subscribes to instead of simulating its own.
const TICK_MS = 4000
// Persist the in-memory fleet to the Vehicle table every 15 ticks (60 s).
const SNAPSHOT_EVERY_TICKS = 15
// Re-run the (cached, 5-min TTL) weather fetch + push to clients so the
// map's rain/risk colours follow the real forecast without a reload.
const WEATHER_PUSH_EVERY_TICKS = 30

let io: IOServer | null = null

export function broadcastSegmentStatus() {
  io?.emit('segments:status', currentSegmentStatuses())
}

export function broadcastVehicles() {
  io?.emit('vehicles:update', getVehicles())
}

export function broadcastGeometry() {
  io?.emit('segments:geometry', { status: geometryStatus(), segments: currentGeometry() })
}

// Region-wide operational state (Disaster Mode) — pushed on connect and
// whenever an official changes it (routes/system.ts).
let systemState: Record<string, unknown> = {}
export function broadcastSystemState(patch: Record<string, unknown>) {
  systemState = { ...systemState, ...patch }
  io?.emit('system:state', systemState)
}
export function primeSystemState(state: Record<string, unknown>) { systemState = { ...systemState, ...state } }

// Data-source summary the frontend shows in its legend ("what on this map
// is live?"). Recomputed on demand; cheap.
export function dataSources() {
  const fleet = getVehicles()
  return {
    weather: weatherStatus(),
    geometry: geometryStatus(),
    fleet: {
      total: fleet.length,
      gps: fleet.filter(v => v.telemetry === 'gps').length,
      simulated: fleet.filter(v => v.telemetry !== 'gps').length,
    },
  }
}
export function broadcastDataSources() { io?.emit('data:sources', dataSources()) }

// WhatsApp outbox + transport state, pushed live to every connected client
// whenever a message is dispatched or a delivery receipt arrives.
export function broadcastWhatsAppStatus() { io?.emit('whatsapp:status', { ...waConfig(), outbox: waOutbox() }) }

export function attachRealtime(httpServer: HTTPServer) {
  io = new IOServer(httpServer, {
    path: '/ws/vehicles',
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  })

  io.on('connection', socket => {
    socket.emit('vehicles:update', getVehicles())
    socket.emit('segments:status', currentSegmentStatuses())
    socket.emit('segments:geometry', { status: geometryStatus(), segments: currentGeometry() })
    socket.emit('system:state', systemState)
    socket.emit('data:sources', dataSources())
    socket.emit('whatsapp:status', { ...waConfig(), outbox: waOutbox() })
  })
  // Real-time: any outbox change (dispatch or delivery receipt) is pushed
  // straight out — the UI updates without a single poll.
  setWaChangeListener(() => broadcastWhatsAppStatus())

  onGeometryUpdated(() => { broadcastGeometry(); broadcastDataSources() })

  // Fleet lifecycle → alerts (+ WhatsApp via the alert hook) so an arrival
  // or a truck slowing on a bad stretch shows up in the ticker immediately.
  onFleetEvent(e => {
    if (e.type === 'delivered') {
      pushFleetAlert({
        type: 'delivery', severity: 'low',
        title: `${e.vehicle.id} arrived at ${e.vehicle.to}`,
        location: e.vehicle.to,
        message: `${e.vehicle.cargoDetail} delivered (${e.vehicle.from} → ${e.vehicle.to}).`,
        action: 'Confirm receipt on the Bookings screen.',
        lat: e.vehicle.lat, lng: e.vehicle.lng,
      }).catch(() => {})
    } else if (e.type === 'hazard') {
      pushFleetAlert({
        type: 'delay', severity: 'medium',
        title: `${e.vehicle.id} slowed — ${e.reason}`,
        location: `${e.vehicle.from} → ${e.vehicle.to}`,
        message: `Speed dropped on route; running ${e.vehicle.delayHours}h behind.`,
        action: 'Check corridor status; consider Plan Route → Find an Alternative Route.',
        lat: e.vehicle.lat, lng: e.vehicle.lng,
        segmentId: e.vehicle.path[0],
      }).catch(() => {})
    }
  })

  let ticksSinceSnapshot = SNAPSHOT_EVERY_TICKS // snapshot on the first tick too
  let ticksSinceWeather = 0
  setInterval(() => {
    const vehicles = tick()
    io!.emit('vehicles:update', vehicles)

    runAlertGeneration('monsoon', vehicles).catch(err => {
      console.error('Alert generation failed:', err)
    })

    if (++ticksSinceSnapshot >= SNAPSHOT_EVERY_TICKS) {
      ticksSinceSnapshot = 0
      snapshotFleetToDb().catch(err => {
        console.error('Vehicle snapshot to DB failed:', err)
      })
    }

    if (++ticksSinceWeather >= WEATHER_PUSH_EVERY_TICKS) {
      ticksSinceWeather = 0
      getRegionWeather().then(w => { io!.emit('weather:update', w); broadcastDataSources() }).catch(() => {})
    }
  }, TICK_MS)

  return io
}
