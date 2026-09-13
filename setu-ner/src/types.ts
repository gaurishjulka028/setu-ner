// ── SETU-NER domain types ──────────────────────────────────────────────────

export type Role = 'citizen' | 'operator' | 'logistics' | 'official' | 'admin'

export interface User {
  id: string
  name: string
  role: Role
  org: string
  districtId: string
  points?: number
  badges?: string[]
  email?: string
  phone?: string
  authProvider?: 'password' | 'google'
}


export type CargoType = 'medicine' | 'food' | 'fuel' | 'construction' | 'agri' | 'relief' | 'pharma'
export type RoadType = 'NH' | 'SH' | 'rural' | 'bridge' | 'waterway'
export type Terrain = 'flat' | 'hilly' | 'mountain'
export type SegStatus = 'open' | 'caution' | 'blocked'
export type Season = 'monsoon' | 'dry'

// Which routing service supplied a road segment's shape. 'stadia' = Stadia
// Maps routing API (the server's primary), 'osrm' = the public OSRM demo
// router (fallback) — both are real OpenStreetMap geometry. 'schematic' =
// still the bundled synthetic curve. See server/src/engine/geometry.ts.
export type GeometrySource = 'stadia' | 'osrm' | 'schematic'

/** True when the shape came from a real routing service rather than the synthetic curve. */
export function isRealGeometrySource(source: GeometrySource | undefined): source is 'stadia' | 'osrm' {
  return source === 'stadia' || source === 'osrm'
}

export interface District {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  hq: string
  population: number
}

export interface Segment {
  id: string
  name: string
  road: string
  roadType: RoadType
  from: string
  to: string
  districtId: string
  coords: [number, number][]
  lengthKm: number
  terrain: Terrain
  slope: number // average gradient %
  elevation: number // metres at highest point
  bridge?: boolean
  singleLane?: boolean
  failureHistory: number // failures in past monsoon seasons
  baseCondition: 'good' | 'fair' | 'poor'
  sensor: { vibration: number; waterLevel: number; surface: number } // 0–100, higher = worse
  reportedStatus?: SegStatus
  reportReason?: string
  // Which routing service supplied the real road shape now on this segment
  // ('stadia' = Stadia Maps routing API, 'osrm' = the public OSRM router —
  // both are real OpenStreetMap geometry, see server/src/engine/geometry.ts).
  // undefined / 'schematic' = still the bundled synthetic curve.
  geometrySource?: 'stadia' | 'osrm' | 'schematic'
  // Optional waterway-specific metadata (road segments omit it). mode is
  // also present on road segments as 'road' for uniform filtering.
  mode?: 'road' | 'waterway'
  // Flat-bottom barge draft limit in metres (waterway only — how risk.ts
  // decides a stretch is navigable for cargo on the Brahmaputra).
  draftM?: number
}

export interface ColdChainFacility {
  id: string
  name: string
  districtId: string
  lat: number
  lng: number
  capacityUnits: number // pallets of refrigerated capacity
  utilizationPct: number // 0–100
  tempStatus: 'ok' | 'at-risk' | 'critical'
}

export type VehicleStatus = 'moving' | 'delayed' | 'halted' | 'delivered'

export interface Vehicle {
  id: string
  driver: string
  org: string
  cargo: CargoType
  cargoDetail: string
  weightT: number
  from: string
  to: string
  path: string[] // segment ids (original planned route)
  progressKm: number
  speedKmph: number
  status: VehicleStatus
  delayHours: number
  lat: number
  lng: number
  trail: [number, number][]
  routeStatus?: 'active' | 'disrupted' | 'replaced'
  replacedRoute?: string[]
  lastMile?: boolean
  community?: string
  contact?: string
  // Where the position comes from. 'gps' = a real device posted it via
  // POST /api/vehicles/:id/position within the last 30 s; 'simulated' =
  // the server's route-following simulation. Shown on the map/track cards
  // so nobody mistakes the demo fleet for real telemetry.
  telemetry?: 'gps' | 'simulated'
  lastFixAt?: number // epoch ms of the last position update (either source)
  headingDeg?: number
  etaHours?: number // remaining hours at current speed along the remaining path
  remainingKm?: number
}

export interface Shipment {
  id: string
  vehicleId: string
  cargo: CargoType
  cargoDetail: string
  shipper: string
  from: string
  to: string
  weightT: number
  dispatchedAt: string
}

export interface Facility {
  id: string
  name: string
  type: 'warehouse' | 'hospital' | 'relief_camp' | 'depot' | 'fuel'
  lat: number
  lng: number
  districtId: string
  note?: string
}

export type IncidentType = 'landslide' | 'flood' | 'roadblock' | 'damage' | 'accident' | 'accessibility' | 'weather' | 'other'
export type Severity = 'minor' | 'partial' | 'impassable'

export interface IncidentReport {
  id: string
  type: IncidentType
  severity: Severity
  description: string
  lat: number
  lng: number
  location?: string
  segmentId?: string
  districtId?: string
  reporter: string
  reporterRole: Role
  photoName?: string
  // Server path/URL to the uploaded photo file (POST /api/reports/photo),
  // e.g. '/uploads/photos/P-xxx.jpg'. Server-served, viewable by officials.
  photoUrl?: string
  photoSeverity?: Severity
  photoConfidence?: number
  status: 'pending' | 'verified' | 'rejected'
  confidence: number
  points: number
  createdAt: number
  synced: boolean
}

export type AlertType =
  | 'landslide' | 'flood' | 'roadblock' | 'weather'
  | 'delay' | 'supply' | 'reroute' | 'convoy' | 'report' | 'disaster'

export interface AlertItem {
  id: string
  type: AlertType
  severity: 'high' | 'medium' | 'low'
  title: string
  location: string
  message: string
  action: string
  time: number
  lat?: number
  lng?: number
  segmentId?: string
  read?: boolean
  resolved?: boolean
}

export interface WeatherPoint {
  id: string
  name: string
  lat: number
  lng: number
  rainNow: number // mm/h current
  tempC: number
  forecast: { hour: number; rain: number }[] // next 24h
  fetchedAt: number
}

export interface StockLevels {
  districtId: string
  medicine: number
  food: number
  fuel: number
  construction: number
}

export interface Booking {
  id: string
  shipper: string
  fromDistrict: string
  toDistrict: string
  cargo: CargoType
  weightT: number
  vehicleId?: string
  status: 'requested' | 'assigned' | 'in_transit' | 'delivered'
  lastMile: boolean
  communityCarrier?: string
  warehouseOut?: boolean
  depotReached?: boolean
  villageReceived?: boolean
  createdAt: number
}

export interface RouteLeg {
  segId: string
  risk: number
}
export interface RouteResult {
  mode: 'safe' | 'fast'
  segIds: string[]
  distanceKm: number
  timeHours: number
  riskMax: number
  delayHours: number
  delayReason?: string
  coords: [number, number][]
  blockedAhead: string[]
}

export interface StartTrackingInput {
  route: RouteResult
  from: string
  to: string
  cargo: CargoType
  weightKg: number
  priority: 'standard' | 'priority' | 'urgent'
  vehicleType?: string
  deadline?: string
}

export interface ReplaceTrackingRouteInput {
  shipmentId: string
  route: RouteResult
}

export interface Snapshot {
  t: number
  vehicles: { id: string; lat: number; lng: number; status: VehicleStatus }[]
}
