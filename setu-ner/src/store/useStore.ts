import { create } from 'zustand'
import type {
  User, Vehicle, IncidentReport, AlertItem, WeatherPoint, Booking, Season,
  Snapshot, Role, CargoType, Severity, SegStatus, GeometrySource,
  StartTrackingInput, ReplaceTrackingRouteInput,
} from '../types'
import { isRealGeometrySource } from '../types'
import { VEHICLES, SEED_REPORTS, SEED_BOOKINGS, SEGMENTS } from '../data/ner'
import { DEMO_EMAILS, DEMO_PASSWORD } from '../data/demoUsers'
import { fetchWeather, fallbackWeather } from '../lib/weather'
import { reportsStore, alertsStore, bookingsStore, outboxStore, saveCache, loadCache, type ReportPayload } from '../lib/db'
import { uid } from '../lib/format'
import { api, setToken, clearToken, getToken, setUnauthorizedHandler } from '../lib/api'
import { getVehicleSocket } from '../lib/socket'

// Demo accounts map 1:1 to the seeded users in server/prisma/seed.ts — both
// now import the same list from data/demoUsers.ts, so there's a single
// source of truth instead of two hand-copied lists that could drift apart.

interface AppState {
  // auth
  user: User | null
  login: (role: Role) => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<User>
  register: (input: { name: string; email: string; password: string; role: 'citizen' | 'operator' | 'logistics'; phone: string; phoneToken: string; org?: string }) => Promise<User>
  googleSignIn: (idToken: string, phoneToken?: string, role?: 'citizen' | 'operator' | 'logistics' | 'official') => Promise<User>
  logout: () => void

  // connectivity
  online: boolean
  lastSync: number | null
  toggleOnline: () => void
  setOnline: (v: boolean) => void

  // ui
  highContrast: boolean
  toggleContrast: () => void
  season: Season
  setSeason: (s: Season) => void
  disasterMode: boolean
  disasterInfo: { activatedBy?: string; activatedAt?: number; note?: string }
  toggleDisaster: () => Promise<void>

  // data
  vehicles: Vehicle[]
  reports: IncidentReport[]
  alerts: AlertItem[]
  weather: Record<string, WeatherPoint>
  bookings: Booking[]
  snapshots: Snapshot[]
  simTime: number
  activeTrackingId: string | null
  // Part 4: true until init()'s first data pass (cache load + backend
  // fetch, or the offline cache-only path) finishes — purely presentational,
  // gates the loading skeletons added in Part 4. Doesn't affect what data
  // gets fetched or how it flows.
  initialLoad: boolean

  // actions
  init: () => void
  refreshWeather: () => Promise<void>
  flushOutbox: () => Promise<void>
  addReport: (r: ReportPayload) => Promise<{ report: IncidentReport; alertId: string }>
  verifyReport: (id: string, approve: boolean) => Promise<void>
  addBooking: (b: Partial<Booking> & { shipper: string; fromDistrict: string; toDistrict: string; cargo: CargoType; weightT: number; contactPhone?: string }) => Promise<void>
  confirmLastMile: (bookingId: string) => Promise<void>
  startTracking: (input: StartTrackingInput) => Promise<string>
  replaceTrackingRoute: (input: ReplaceTrackingRouteInput) => Promise<void>
  // Bumped whenever report-driven road statuses OR road geometry arrive
  // from the server so memoised risk calculations (which read the mutable
  // SEGMENTS array) recompute. Value itself is meaningless — only changes
  // matter.
  segmentsVersion: number
  // Which parts of what's on screen are live right now (server-reported).
  // Drives the map's data-source legend so the demo is honest about what is
  // real telemetry / forecast / official data and what is simulated.
  dataSources: DataSources | null
  socketConnected: boolean
  removeShipment: (id: string) => Promise<void>
  markAllAlertsRead: () => void
  resolveAlert: (id: string) => Promise<void>
  pushAlert: (a: Omit<AlertItem, 'id' | 'time' | 'read'>) => Promise<void>
}

export interface DataSources {
  weather: { live: boolean; fetchedAt: number | null; provider: string; anchors: number }
  geometry: {
    source: GeometrySource
    snapped: number
    total: number
    /** How many corridors each provider supplied, so the legend can name the real one. */
    byProvider?: Record<GeometrySource, number>
    /** Corridors at full routing detail (vs the bundled 'simplified' baseline). */
    fullDetail?: number
    fetchedAt: string | null
    fetching: boolean
    /** Endpoint a refresh hits first. */
    provider: string
    /** Endpoint it falls back to (null when Stadia isn't configured). */
    fallback?: string | null
    error?: string
  }
  fleet: { total: number; gps: number; simulated: number }
  govtAlerts?: { live: boolean; fetchedAt: number | null; count: number }
  whatsapp?: { transport: string; live: boolean }
}

// The server's fleet payload is authoritative (shipments started from Plan
// Route are created server-side and arrive in the same feed).
function mergeVehicles(_current: Vehicle[], incoming: Vehicle[]): Vehicle[] {
  return incoming
}

// Road geometry from the server (GET /api/segments/geometry + the
// 'segments:geometry' socket event): real OSM road shapes replace the
// bundled schematic curves in the shared SEGMENTS array. lengthKm follows
// so the ETA maths and the map agree. `source` names the routing service
// that supplied the shape — 'stadia' (Stadia Maps, the server's primary) or
// 'osrm' (public OSRM demo, the fallback); both are real geometry and are
// applied identically.
type SegmentGeometryRow = { segmentId: string; coords: [number, number][]; lengthKm: number; source: GeometrySource }
function applySegmentGeometry(rows: SegmentGeometryRow[]) {
  const byId = new Map(rows.map(r => [r.segmentId, r]))
  let changed = false
  for (const seg of SEGMENTS) {
    const row = byId.get(seg.id)
    if (!row || !isRealGeometrySource(row.source) || row.coords.length < 2) continue
    seg.coords = row.coords
    seg.lengthKm = row.lengthKm
    seg.geometrySource = row.source
    changed = true
  }
  return changed
}

// Report-driven road statuses come from the server (GET /api/segments/status
// + the 'segments:status' socket event). The frontend bundles SEGMENTS for
// offline use, so overlay them onto that shared array — every consumer
// (risk.ts, MapView, PlanRoute, Chatbot) reads from it.
type SegmentStatusRow = { segmentId: string; reportedStatus: SegStatus | null; reportReason: string | null }
function applySegmentStatuses(rows: SegmentStatusRow[]) {
  const byId = new Map(rows.map(r => [r.segmentId, r]))
  for (const seg of SEGMENTS) {
    const row = byId.get(seg.id)
    if (!row) continue
    seg.reportedStatus = row.reportedStatus ?? undefined
    seg.reportReason = row.reportReason ?? undefined
  }
}

function loadUser(): User | null {
  try {
    // A user without a token can't do anything authenticated — treat as
    // signed out rather than showing a logged-in shell whose calls all 401.
    if (!getToken()) { localStorage.removeItem('setu-user'); return null }
    const raw = localStorage.getItem('setu-user')
    return raw ? JSON.parse(raw) as User : null
  } catch { return null }
}
function loadPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v) as T } catch { return fallback }
}

export const useStore = create<AppState>((set, get) => ({
  user: loadUser(),
  online: navigator.onLine,
  lastSync: null,
  highContrast: loadPref('setu-hc', false),
  season: loadPref('setu-season', 'monsoon' as Season),
  disasterMode: false,
  disasterInfo: {},
  vehicles: VEHICLES.map(v => ({ ...v })),
  segmentsVersion: 0,
  reports: [],
  alerts: [],
  weather: fallbackWeather(),
  bookings: SEED_BOOKINGS.map(b => ({ ...b })),
  snapshots: [],
  simTime: Date.now(),
  activeTrackingId: loadPref('setu-active-tracking', null as string | null),
  initialLoad: true,
  dataSources: null,
  socketConnected: false,

  login: async (role) => {
    const email = DEMO_EMAILS[role] ?? DEMO_EMAILS.citizen
    const { token, user } = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password: DEMO_PASSWORD })
    setToken(token)
    localStorage.setItem('setu-user', JSON.stringify(user))
    set({ user })
  },
  loginWithPassword: async (email, password) => {
    const { token, user } = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password })
    setToken(token)
    localStorage.setItem('setu-user', JSON.stringify(user))
    set({ user })
    return user
  },
  register: async (input) => {
    const { token, user } = await api.post<{ token: string; user: User }>('/api/auth/register', input)
    setToken(token)
    localStorage.setItem('setu-user', JSON.stringify(user))
    set({ user })
    return user
  },
  googleSignIn: async (idToken, phoneToken, role) => {
    const body: Record<string, unknown> = { idToken }
    if (phoneToken) body.phoneToken = phoneToken
    if (role) body.role = role
    const { token, user } = await api.post<{ token: string; user: User }>('/api/auth/google', body)
    setToken(token)
    localStorage.setItem('setu-user', JSON.stringify(user))
    set({ user })
    return user
  },
  logout: () => {
    localStorage.removeItem('setu-user')
    clearToken()
    set({ user: null })
  },

  toggleOnline: () => get().setOnline(!get().online),
  setOnline: (v) => {
    set({ online: v })
    if (v) {
      get().refreshWeather()
      get().flushOutbox()
      set({ lastSync: Date.now() })
    }
  },

  toggleContrast: () => {
    const highContrast = !get().highContrast
    localStorage.setItem('setu-hc', JSON.stringify(highContrast))
    set({ highContrast })
  },
  setSeason: (s) => { localStorage.setItem('setu-season', JSON.stringify(s)); set({ season: s }) },
  // Region-wide: stored on the server and pushed to every client over the
  // 'system:state' socket event, so one official's activation is visible to
  // all users (banner, map overlays, routing advice). Only official/admin
  // may change it — the API enforces that.
  toggleDisaster: async () => {
    const next = !get().disasterMode
    set({ disasterMode: next }) // optimistic; socket push confirms/corrects
    try {
      const state = await api.put<{ active: boolean; activatedBy?: string; activatedAt?: number; note?: string }>('/api/system/disaster-mode', { active: next })
      set({ disasterMode: state.active, disasterInfo: { activatedBy: state.activatedBy, activatedAt: state.activatedAt, note: state.note } })
    } catch (e) {
      set({ disasterMode: !next })
      throw e
    }
  },

  init: async () => {
    // Expired/invalid token on any call → drop the session (see lib/api.ts).
    setUnauthorizedHandler((reason, rejectedToken) => {
      if (!get().user) return
      // A fresh login may have completed while this 401 was in flight (e.g.
      // the startup /api/auth/me that still carried the old token). If the
      // stored token has moved on from the one that was actually rejected,
      // this 401 is about a dead request — don't wipe the new session.
      if (rejectedToken && getToken() !== rejectedToken) return
      localStorage.removeItem('setu-user')
      clearToken()
      // Login page reads this once so the user sees WHY they were bounced
      // instead of a silent redirect.
      try { sessionStorage.setItem('setu-auth-notice', reason) } catch { /* noop */ }
      set({ user: null })
    })
    // Validate a restored session against the server once at startup so a
    // stale token from a previous run doesn't masquerade as a login.
    if (get().user && navigator.onLine) {
      api.get<{ user: User }>('/api/auth/me')
        .then(({ user }) => { localStorage.setItem('setu-user', JSON.stringify(user)); set({ user }) })
        .catch(() => { /* 401 handled by the handler above; network errors keep the cached user */ })
    }

    // 1) cache-first paint — instant, works offline, matches whatever this
    // tab last saw before any network round-trip resolves.
    // Defense-in-depth: db.ts's own db() already falls back to an in-memory
    // store when IndexedDB is unavailable, but a per-call .catch() here
    // means one unexpected rejection can never again take down the rest of
    // init() (socket wireup, weather refresh, initialLoad flip) the way an
    // unguarded Promise.all here previously could.
    const [localReports, localBookings, cachedAlerts] = await Promise.all([
      reportsStore.all().catch(() => []),
      bookingsStore.all().catch(() => []),
      alertsStore.all().catch(() => []),
    ])
    const reports = localReports.length ? localReports : SEED_REPORTS.map(r => ({ ...r }))
    const bookings = localBookings.length ? localBookings : SEED_BOOKINGS.map(b => ({ ...b }))
    set({ reports, bookings, alerts: cachedAlerts })

    // 2) subscribe to the live vehicle feed (Part 3 step 3) — replaces the
    // old client-side tick() interval. Every push both updates the fleet
    // and appends a snapshot, so Track.tsx's replay scrubber keeps working.
    const socket = getVehicleSocket()
    socket.on('connect', () => set({ socketConnected: true }))
    socket.on('disconnect', () => set({ socketConnected: false }))
    socket.on('segments:geometry', (payload: { status: DataSources['geometry']; segments: SegmentGeometryRow[] }) => {
      if (applySegmentGeometry(payload.segments)) set({ segmentsVersion: get().segmentsVersion + 1 })
      const ds = get().dataSources
      if (ds) set({ dataSources: { ...ds, geometry: payload.status } })
    })
    socket.on('data:sources', (ds: DataSources) => set({ dataSources: { ...get().dataSources, ...ds } }))
    socket.on('weather:update', (weather: Record<string, WeatherPoint>) => {
      if (weather && Object.keys(weather).length) set({ weather, lastSync: Date.now() })
    })
    socket.on('vehicles:update', (incoming: Vehicle[]) => {
      const vehicles = mergeVehicles(get().vehicles, incoming)
      const snapshot: Snapshot = { t: Date.now(), vehicles: vehicles.map(v => ({ id: v.id, lat: v.lat, lng: v.lng, status: v.status })) }
      const snapshots = [...get().snapshots, snapshot].slice(-40)
      set({ vehicles, snapshots, simTime: Date.now() })
    })
    socket.on('system:state', (state: { disasterMode?: { active: boolean; activatedBy?: string; activatedAt?: number; note?: string }; disasterAlert?: AlertItem }) => {
      if (state?.disasterMode) {
        const d = state.disasterMode
        const next = state.disasterAlert
          ? [state.disasterAlert, ...get().alerts.filter(a => a.id !== state.disasterAlert!.id)].slice(0, 60)
          : get().alerts
        set({ disasterMode: d.active, disasterInfo: { activatedBy: d.activatedBy, activatedAt: d.activatedAt, note: d.note }, alerts: next })
        if (state.disasterAlert) alertsStore.bulk([state.disasterAlert]).catch(() => {})
      }
    })
    socket.on('segments:status', (rows: SegmentStatusRow[]) => {
      applySegmentStatuses(rows)
      set({ segmentsVersion: get().segmentsVersion + 1 })
    })

    if (!get().online) {
      const cache = await loadCache()
      if (cache?.weather) set({ weather: cache.weather, lastSync: cache.syncedAt })
      set({ initialLoad: false })
      return
    }

    // 3) online — pull live state from the real backend, falling back to
    // whatever cache-first already loaded if any single call fails (e.g.
    // not logged in yet, so the auth-only endpoints 401).
    try {
      const [freshReports, freshBookings, freshAlerts, freshVehicles, segStatuses, geometry, sources] = await Promise.all([
        api.get<IncidentReport[]>('/api/reports').catch(() => reports),
        api.get<Booking[]>('/api/bookings').catch(() => bookings),
        api.get<AlertItem[]>('/api/alerts').catch(() => cachedAlerts),
        api.get<Vehicle[]>('/api/vehicles').catch(() => get().vehicles),
        api.get<SegmentStatusRow[]>('/api/segments/status').catch(() => null),
        api.get<{ status: DataSources['geometry']; segments: SegmentGeometryRow[] }>('/api/segments/geometry').catch(() => null),
        api.get<DataSources>('/api/data-sources').catch(() => null),
      ])
      if (segStatuses) applySegmentStatuses(segStatuses)
      if (geometry) applySegmentGeometry(geometry.segments)
      if (sources) set({ dataSources: sources })
      api.get<{ active: boolean; activatedBy?: string; activatedAt?: number; note?: string }>('/api/system/disaster-mode')
        .then(d => set({ disasterMode: d.active, disasterInfo: { activatedBy: d.activatedBy, activatedAt: d.activatedAt, note: d.note } }))
        .catch(() => {})
      set({ reports: freshReports, bookings: freshBookings, alerts: freshAlerts, vehicles: mergeVehicles(get().vehicles, freshVehicles), segmentsVersion: get().segmentsVersion + 1 })
      await Promise.all([
        reportsStore.bulk(freshReports),
        bookingsStore.bulk(freshBookings),
        alertsStore.bulk(freshAlerts),
      ])
    } catch { /* keep whatever cache-first already set */ }

    await get().refreshWeather()
    await get().flushOutbox()
    set({ initialLoad: false })
  },

  refreshWeather: async () => {
    if (!get().online) return
    const weather = await fetchWeather()
    set({ weather, lastSync: Date.now() })
    const cache = await loadCache()
    await saveCache({ weather, snapshots: cache?.snapshots ?? get().snapshots, syncedAt: Date.now() })
    // new weather may have triggered new server-side alerts (see
    // runAlertGeneration in server/src/engine/alerts.ts) — pick those up too.
    const alerts = await api.get<AlertItem[]>('/api/alerts').catch(() => get().alerts)
    set({ alerts })
    await alertsStore.bulk(alerts)
  },

  // Part 3 step 5: flush any field reports queued while offline. Runs
  // whenever the app comes back online (setOnline(true)/toggleOnline) and
  // once more at startup, in case the tab was closed mid-outage with items
  // still queued from a previous session.
  flushOutbox: async () => {
    const pending = await outboxStore.all()
    if (!pending.length) return
    let synced = 0
    for (const item of pending) {
      try {
        const { report } = await api.post<{ report: IncidentReport; alertId: string }>('/api/reports', item.payload)
        set({ reports: [report, ...get().reports.filter(r => r.id !== item.localId)] })
        await reportsStore.remove(item.localId)
        await reportsStore.put(report)
        await outboxStore.remove(item.localId)
        synced++
      } catch {
        break // still unreachable — stop and retry the rest next time
      }
    }
    if (synced) {
      get().pushAlert({
        type: 'report', severity: 'low', title: `${synced} field report(s) synced`,
        location: 'Outbox', message: 'Queued offline reports delivered to the control room.',
        action: 'No action needed.',
      })
    }
  },

  // Part 3 step 4/5: submit to the real backend; if offline (or the
  // request fails even though we thought we were online), show the report
  // immediately as a local pending entry and queue it in the outbox for
  // flushOutbox() to deliver later.
  addReport: async (r) => {
    const localId = uid('LR')
    const localReport: IncidentReport = {
      ...r,
      id: localId,
      reporter: get().user?.name ?? 'Anonymous citizen',
      reporterRole: get().user?.role ?? 'citizen',
      status: 'pending',
      confidence: r.photoSeverity ? 0.5 : 0.35,
      points: 0,
      createdAt: Date.now(),
      synced: false,
    }
    set({ reports: [localReport, ...get().reports] })
    await reportsStore.put(localReport)

    if (!get().online) {
      await outboxStore.add({ localId, payload: r, queuedAt: Date.now() })
      return { report: localReport, alertId: `${localId}-pending` }
    }

    try {
      const { report, alertId } = await api.post<{ report: IncidentReport; alertId: string }>('/api/reports', r)
      set({ reports: [report, ...get().reports.filter(x => x.id !== localId)] })
      await reportsStore.remove(localId)
      await reportsStore.put(report)
      const alerts = await api.get<AlertItem[]>('/api/alerts').catch(() => get().alerts)
      set({ alerts })
      return { report, alertId }
    } catch {
      // thought we were online but the request failed anyway — queue it
      await outboxStore.add({ localId, payload: r, queuedAt: Date.now() })
      return { report: localReport, alertId: `${localId}-pending` }
    }
  },

  verifyReport: async (id, approve) => {
    try {
      const updated = await api.patch<IncidentReport>(`/api/reports/${id}/verify`, { approve })
      set({ reports: get().reports.map(r => r.id === id ? updated : r) })
      await reportsStore.put(updated)
    } catch (e) {
      console.error('Failed to verify report:', e)
    }
  },

  addBooking: async (b) => {
    const booking = await api.post<Booking>('/api/bookings', b)
    set({ bookings: [booking, ...get().bookings] })
    await bookingsStore.put(booking)
  },

  // Plan Route → "Start Tracking": the server creates the vehicle in the
  // shared simulated fleet + its booking (POST /api/shipments), so the
  // shipment survives refresh and is visible to every user/tab. The
  // socket push that follows carries the new vehicle; we also merge the
  // response immediately so Track can select it without waiting a tick.
  startTracking: async (input) => {
    const { vehicle, booking } = await api.post<{ vehicle: Vehicle; booking: Booking }>('/api/shipments', {
      route: { segIds: input.route.segIds, distanceKm: input.route.distanceKm, timeHours: input.route.timeHours, delayHours: input.route.delayHours },
      from: input.from, to: input.to, cargo: input.cargo, weightKg: input.weightKg,
      priority: input.priority, vehicleType: input.vehicleType || undefined, deadline: input.deadline || undefined,
    })
    localStorage.setItem('setu-active-tracking', JSON.stringify(vehicle.id))
    set({
      vehicles: [vehicle, ...get().vehicles.filter(v => v.id !== vehicle.id)],
      bookings: [booking, ...get().bookings.filter(b => b.id !== booking.id)],
      activeTrackingId: vehicle.id,
    })
    await bookingsStore.put(booking)
    return vehicle.id
  },

  removeShipment: async (id) => {
    await api.delete(`/api/shipments/${encodeURIComponent(id)}`)
    set({ vehicles: get().vehicles.filter(v => v.id !== id), activeTrackingId: get().activeTrackingId === id ? null : get().activeTrackingId })
    if (get().activeTrackingId === null) localStorage.removeItem('setu-active-tracking')
  },

  replaceTrackingRoute: async ({ shipmentId, route }) => {
    const updated = await api.patch<Vehicle>(`/api/shipments/${encodeURIComponent(shipmentId)}/route`, {
      route: { segIds: route.segIds, distanceKm: route.distanceKm, timeHours: route.timeHours, delayHours: route.delayHours },
    })
    localStorage.setItem('setu-active-tracking', JSON.stringify(shipmentId))
    set({ vehicles: get().vehicles.map(v => v.id === shipmentId ? updated : v), activeTrackingId: shipmentId })
  },

  confirmLastMile: async (bookingId) => {
    const booking = await api.patch<Booking>(`/api/bookings/${bookingId}/last-mile`, {})
    const vehicles = booking.vehicleId
      ? get().vehicles.map(v => v.id === booking.vehicleId ? { ...v, status: 'delivered' as const, routeStatus: 'active' as const } : v)
      : get().vehicles
    set({ bookings: get().bookings.map(b => b.id === bookingId ? booking : b), vehicles })
    await bookingsStore.put(booking)
    const alerts = await api.get<AlertItem[]>('/api/alerts').catch(() => get().alerts)
    set({ alerts })
  },

  markAllAlertsRead: () => {
    const unread = get().alerts.filter(a => !a.read)
    set({ alerts: get().alerts.map(a => ({ ...a, read: true })) })
    unread.forEach(a => { api.patch(`/api/alerts/${a.id}/read`, {}).catch(() => { /* best-effort */ }) })
  },

  resolveAlert: async (id) => {
    set({ alerts: get().alerts.map(alert => alert.id === id ? { ...alert, resolved: true, read: true } : alert) })
    try {
      const alert = await api.patch<AlertItem>(`/api/alerts/${id}/resolve`, {})
      set({ alerts: get().alerts.map(a => a.id === id ? alert : a) })
      await alertsStore.bulk([alert])
    } catch (e) {
      console.error('Failed to resolve alert:', e)
    }
  },

  pushAlert: async (a) => {
    try {
      const alert = await api.post<AlertItem>('/api/alerts', a)
      set({ alerts: [alert, ...get().alerts].slice(0, 60) })
      await alertsStore.bulk([alert])
    } catch (e) {
      console.error('Failed to push alert:', e)
    }
  },
}))

export type { Severity }
