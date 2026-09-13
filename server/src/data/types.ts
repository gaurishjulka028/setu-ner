// Re-exports setu-ner/src/types.ts so the backend works with exactly the
// same shapes the frontend does — no separate type definitions to drift.
export type {
  Role, User, CargoType, RoadType, Terrain, SegStatus, Season,
  District, Segment, VehicleStatus, Vehicle, Shipment, Facility,
  IncidentType, Severity, IncidentReport, AlertType, AlertItem,
  WeatherPoint, StockLevels, Booking, RouteLeg, RouteResult,
  StartTrackingInput, ReplaceTrackingRouteInput, Snapshot,
} from '../../../setu-ner/src/types'
