import { Fragment, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents, CircleMarker, Tooltip, LayerGroup } from 'react-leaflet'
import L from 'leaflet'
import { useStore, type DataSources } from '../store/useStore'
import { timeAgo } from '../lib/format'
import { SEGMENTS, FACILITIES, DISTRICTS, NODES, NER_CENTER, NER_ZOOM, COLD_CHAIN, isWaterway } from '../data/ner'
import { riskOf, statusColor, accessibilityScore } from '../lib/risk'
import { isRealGeometrySource } from '../types'
import type { RouteResult } from '../types'

export interface LayerToggles {
  roads: boolean
  routes: boolean
  shipments: boolean
  incidents: boolean
  weather: boolean
  riskZones: boolean
  blockedRoads: boolean
  risk: boolean
  accessibility: boolean
  vehicles: boolean
  facilities: boolean
  reports: boolean
  alerts: boolean
  gaps: boolean
  coldChain: boolean
  waterway: boolean
}
export const DEFAULT_LAYERS: LayerToggles = {
  roads: true, routes: true, shipments: false, incidents: false, weather: false,
  riskZones: false, blockedRoads: false, risk: false, accessibility: false, vehicles: true,
  facilities: false, reports: false, alerts: true, gaps: false, coldChain: false, waterway: false,
}

const STADIA_KEY = (import.meta.env.VITE_STADIA_API_KEY as string | undefined)?.trim() || ''

// ── Basemap tiles ──────────────────────────────────────────────────────────
// Stadia Maps "Alidade" is the sole tile provider (per the tile-usage policy:
// tile.openstreetmap.org blocks browser apps that don't follow its policy).
// The key is read from VITE_STADIA_API_KEY in setu-ner/.env (shipped in
// .env.example). If it's missing, Stadia's tiles will be rejected rather than
// silently swapping in a different provider.
// NOTE: the attribution control is intentionally turned off on the
// MapContainer (attributionControl={false}) to keep the map uncluttered for
// this build. Stadia/OpenStreetMap's terms normally expect on-map credit —
// if this ever ships beyond a demo, put it back (or credit them elsewhere,
// e.g. an About/Help page) before relying on their tiles in production.

function divIcon(html: string, size = 32) {
  return L.divIcon({ html, className: 'setu-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const circle = (bg: string, emoji: string, ring = '#fff') =>
  `<div style="width:30px;height:30px;border-radius:50%;background:${bg};border:2.5px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.3)">${emoji}</div>`

// Vehicle marker: coloured disc + emoji, a heading arrow when the engine
// knows the bearing, and a small badge saying whether the position is a
// real GPS fix ("GPS", green) or the server simulation ("SIM", grey).
const vehicleIcon = (bg: string, emoji: string, ring: string, heading: number | undefined, telemetry: 'gps' | 'simulated' | undefined, big: boolean) => {
  const size = big ? 38 : 30
  const arrow = heading == null ? '' : `<div style="position:absolute;left:50%;top:50%;width:0;height:0;transform:translate(-50%,-50%) rotate(${heading}deg) translateY(-${size / 2 + 7}px);border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${bg};filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))"></div>`
  const badge = telemetry === 'gps'
    ? `<div style="position:absolute;right:-6px;bottom:-4px;background:#2E9E5B;color:#fff;font:800 8px/1 system-ui;padding:2px 3px;border-radius:4px;border:1.5px solid #fff">GPS</div>`
    : `<div style="position:absolute;right:-6px;bottom:-4px;background:#64748b;color:#fff;font:800 8px/1 system-ui;padding:2px 3px;border-radius:4px;border:1.5px solid #fff">SIM</div>`
  return `<div style="position:relative;width:${size}px;height:${size}px">${arrow}<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2.5px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:${big ? 18 : 15}px;box-shadow:0 2px 6px rgba(0,0,0,.3)">${emoji}</div>${badge}</div>`
}

function MapEvents({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick?.(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

function FlyTo({ target, zoom }: { target: [number, number] | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, zoom ?? map.getZoom(), { duration: 0.8 })
  }, [target?.[0], target?.[1]])
  return null
}

// Leaflet measures its container's size once, at construction. If that
// happens before the surrounding layout has settled — a card still
// animating in, a flex/grid parent whose height depends on a sibling,
// a tab/panel that was `display:none` a moment earlier — the map freezes
// at the wrong size (tiles missing at the edges, or a gap where the map
// thinks it ends but the container is taller). `invalidateSize()` re-reads
// the real box: once right after mount (after layout/animations settle)
// and again on every window resize / orientation change.
function ResizeFix() {
  const map = useMap()
  useEffect(() => {
    const fix = () => map.invalidateSize()
    const t1 = setTimeout(fix, 100)
    const t2 = setTimeout(fix, 400)
    window.addEventListener('resize', fix)
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', fix) }
  }, [map])
  return null
}

interface Props {
  layers?: Partial<LayerToggles>
  route?: RouteResult | null
  altRoute?: RouteResult | null
  focus?: [number, number] | null
  focusZoom?: number
  onPick?: (lat: number, lng: number) => void
  selectedVehicleId?: string | null
  selectedRoute?: string[]
  currentLocation?: [number, number] | null
  disaster?: boolean
  gapMap?: Record<string, number> // districtId -> days of stock
  height?: string
  // Show the "what's live on this map" legend (default on). Pages that
  // render several small maps can turn it off.
  showSources?: boolean
}

// Names the routing service that actually supplied the road shapes, so the
// legend is honest about provenance: Stadia Maps is the server's primary
// source, the public OSRM demo router its fallback, and a mixed result is
// reported as mixed rather than rounded up to whichever looks better.
function geometryProviderLabel(g?: DataSources['geometry']): string {
  if (!g) return 'OpenStreetMap routing'
  const by = g.byProvider
  const stadia = by?.stadia ?? 0
  const osrm = by?.osrm ?? 0
  if (stadia > 0 && osrm > 0) return `Stadia Maps (${stadia}) + OSRM (${osrm})`
  if (stadia > 0) return 'Stadia Maps routing'
  if (osrm > 0) return 'OSRM routing'
  return g.source === 'stadia' ? 'Stadia Maps routing' : g.source === 'osrm' ? 'OSRM routing' : 'OpenStreetMap routing'
}

// Bottom-right legend: which layers are driven by live data right now vs
// bundled / simulated. Reads the server's self-report (GET /api/data-sources
// + 'data:sources' socket) — nothing here is asserted by the client.
function SourcesLegend() {
  const { dataSources: ds, socketConnected, online, lastSync } = useStore()
  const [open, setOpen] = useState(false)
  const dot = (ok: boolean | undefined, warn = false) => <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-success' : warn ? 'bg-caution' : 'bg-slate-400'}`} />
  const fleetGps = ds?.fleet.gps ?? 0
  const fleetTotal = ds?.fleet.total ?? 0
  // 'stadia' and 'osrm' both mean "snapped to the real road" — only
  // 'schematic' is the synthetic curve.
  const geomOk = isRealGeometrySource(ds?.geometry.source)
  const geomProvider = geometryProviderLabel(ds?.geometry)
  return (
    <div className="absolute bottom-6 right-3 z-[500] text-[11px] font-semibold text-slate-700">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 shadow-card border border-slate-200 hover:bg-white" title="What on this map is live?">
        {dot(socketConnected && online)} <span>{socketConnected && online ? 'Live' : 'Offline'}</span>
        <span className="text-slate-300">|</span>
        {dot(fleetGps > 0, fleetTotal > 0)} <span>GPS {fleetGps}/{fleetTotal}</span>
        <span className="text-slate-300">|</span>
        {dot(ds?.weather.live)} <span>Weather</span>
        <span className="text-slate-300">|</span>
        {dot(geomOk, (ds?.geometry.snapped ?? 0) > 0)} <span>Roads</span>
        <span className="text-slate-400 ml-1">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-1 w-[300px] rounded-lg bg-white/98 px-3 py-2.5 shadow-card border border-slate-200 space-y-1.5 font-medium">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Data sources on this map</div>
          <Row ok={socketConnected && online} label="Live feed" detail={socketConnected ? `socket connected${lastSync ? ` · synced ${timeAgo(lastSync)}` : ''}` : 'socket disconnected — showing last known state'} />
          <Row ok={fleetGps > 0} warn={fleetTotal > 0} label="Vehicle positions"
            detail={fleetTotal === 0 ? 'no vehicles' : fleetGps > 0 ? `${fleetGps} on real GPS (driver phone / tracker), ${ds!.fleet.simulated} simulated by the server` : `all ${fleetTotal} simulated by the server along their planned route (${'SIM'} badge). Share your phone location from Track to add a real one.`} />
          <Row ok={ds?.weather.live} label="Rain / risk colours"
            detail={ds?.weather.live ? `Open-Meteo forecast for ${ds.weather.anchors} NER stations${ds.weather.fetchedAt ? ` · ${timeAgo(ds.weather.fetchedAt)}` : ''} → risk engine` : 'monsoon baseline table (forecast API unreachable)'} />
          <Row ok={geomOk} warn={(ds?.geometry.snapped ?? 0) > 0} label="Road shapes"
            detail={ds?.geometry.fetching
              ? `snapping to real roads via ${geomProvider}… ${ds.geometry.snapped}/${ds.geometry.total}`
              : geomOk
                ? `real highway geometry from ${geomProvider} (OpenStreetMap data), ${ds!.geometry.snapped}/${ds!.geometry.total} corridors${ds!.geometry.fullDetail != null ? ` · ${ds!.geometry.fullDetail}/${ds!.geometry.total} at full routing detail` : ''}${ds!.geometry.error ? ` · last upgrade attempt failed (${ds!.geometry.error})` : ''}`
                : `${ds?.geometry.snapped ?? 0}/${ds?.geometry.total ?? '?'} corridors on real geometry${ds?.geometry.snapped ? ` (${geomProvider})` : ''} — rest schematic${ds?.geometry.error ? ` (${ds.geometry.error})` : ''}`} />
          <Row ok={ds?.govtAlerts?.live} label="Official alerts" detail={ds?.govtAlerts ? (ds.govtAlerts.live ? `NDMA SACHET live feed · ${ds.govtAlerts.count} for NER` : 'bundled sample — SACHET unreachable') : 'not loaded'} />
          <Row ok={true} label="Road statuses" detail="field reports (verified by officials) + risk engine" />
          <Row ok={true} label="Routes" detail="computed on the server per request — Dijkstra over risk-weighted corridors, hybrid rules + learned model" />
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">Base map © Stadia Maps · OpenStreetMap contributors</div>
        </div>
      )}
    </div>
  )
}
function Row({ ok, warn, label, detail }: { ok: boolean | undefined; warn?: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-2">
      <span className={`mt-1 inline-block w-2 h-2 shrink-0 rounded-full ${ok ? 'bg-success' : warn ? 'bg-caution' : 'bg-slate-400'}`} />
      <div><span className="font-bold text-slate-800">{label}</span> <span className="text-slate-500">— {detail}</span></div>
    </div>
  )
}

export default function MapView({ layers, route, altRoute, focus, focusZoom, onPick, selectedVehicleId, selectedRoute, currentLocation, disaster, gapMap, height = '100%', showSources = true }: Props) {
  const L_ = { ...DEFAULT_LAYERS, ...layers }
  const { weather, season, vehicles, reports, alerts, online, segmentsVersion } = useStore()

  const segRisks = useMemo(() => {
    const m = new Map(SEGMENTS.map(s => [s.id, riskOf(s, weather, season)]))
    return m
  }, [weather, season, segmentsVersion])

  const facilityIcon = (t: string) =>
    t === 'hospital' ? '🏥' : t === 'relief_camp' ? '⛺' : t === 'warehouse' ? '🏬' : t === 'depot' ? '🚧' : '⛽'

  // cold-chain temp status → same green/amber/red convention as stock gaps
  const tempColor = (t: string) => (t === 'ok' ? '#2E9E5B' : t === 'at-risk' ? '#E08E29' : '#D64545')
  const tempText = (t: string) => (t === 'ok' ? '#2E9E5B' : t === 'at-risk' ? '#E08E29' : '#D64545')
  const tempLabel = (t: string) => (t === 'ok' ? '● Within range' : t === 'at-risk' ? '▲ At risk of thaw' : '⚠ Critical — capacity full / temp breach')

  // disaster overlays: corridors toward relief hub Haflong & Dimapur
  const corridorIds = ['E16', 'E34', 'E26', 'E01', 'E02', 'E11']
  const cutoffNodes = ['HFL', 'JWI']

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
    <MapContainer center={NER_CENTER} zoom={NER_ZOOM} style={{ height: '100%', width: '100%' }} scrollWheelZoom zoomControl attributionControl={false}>
      <TileLayer
        url={`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`}
        maxZoom={19}
        subdomains="abcd"
      />
      <MapEvents onPick={onPick} />
      <FlyTo target={focus ?? null} zoom={focusZoom} />
      <ResizeFix />

      {/* district supply-gap circles */}
      {L_.gaps && gapMap && (
        <LayerGroup>
          {DISTRICTS.map(d => {
            const v = gapMap[d.id]
            if (v == null) return null
            const color = v <= 3 ? '#D64545' : v <= 7 ? '#E0A929' : '#2E9E5B'
            return (
              <CircleMarker key={d.id} center={[d.lat, d.lng]} radius={16} pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }}>
                <Tooltip>{d.name}: {v} days stock (worst commodity)</Tooltip>
              </CircleMarker>
            )
          })}
        </LayerGroup>
      )}

      {/* road segments */}
      {(L_.roads || L_.risk || L_.riskZones || L_.accessibility || L_.blockedRoads) && (
        <LayerGroup>
          {SEGMENTS.filter(seg => !isWaterway(seg)).map(seg => {
            const r = segRisks.get(seg.id)!
            if (L_.blockedRoads && r.status !== 'blocked') return null
            let color = statusColor(r.status)
            let opacity = 0.95
            // Driver-grade widths: NH corridors are the thing a truck follows,
            // so they read as a bold ribbon (8 px) with a dark casing
            // underneath — the same road-on-basemap treatment navigation
            // apps use, which keeps the line legible over green hill terrain
            // and lets the real geometry (every bend, hairpin) be seen.
            let weight = seg.roadType === 'NH' ? 8 : seg.roadType === 'bridge' ? 7 : 6
            if (L_.accessibility && !L_.riskZones && !L_.risk) {
              const a = accessibilityScore(seg, weather, season)
              color = a >= 70 ? '#2E9E5B' : a >= 45 ? '#E0A929' : '#D64545'
            } else if ((L_.risk || L_.riskZones) && !L_.roads) {
              const t = r.total
              color = t >= 66 ? '#7f1d1d' : t >= 50 ? '#D64545' : t >= 35 ? '#E08E29' : t >= 22 ? '#e9c46a' : '#2E9E5B'
              weight = 5 + (t / 100) * 5
              opacity = 0.9
            }
            const lineOpacity = disaster ? 0.25 : opacity
            return (
              <Fragment key={seg.id}>
                <Polyline
                  positions={seg.coords}
                  interactive={false}
                  pathOptions={{ color: '#0f172a', weight: weight + 3.5, opacity: disaster ? 0.15 : 0.55, lineCap: 'round', lineJoin: 'round' }}
                />
              <Polyline
                positions={seg.coords}
                pathOptions={{ color, weight, opacity: lineOpacity, lineCap: 'round', lineJoin: 'round' }}
              >
                <Tooltip sticky>
                  <div style={{ minWidth: 150 }}>
                    <strong>{seg.name}</strong><br />
                    {seg.terrain} · slope {seg.slope}% · {seg.elevation}m<br />
                    Risk: <strong style={{ color }}>{r.total}/100</strong> · rain {r.rainMm}mm/h<br />
                    Accessibility: <strong>{accessibilityScore(seg, weather, season)}/100</strong><br />
                    {seg.failureHistory} past monsoon failures<br />
                    Status: <strong style={{ color }}>{r.status.toUpperCase()}</strong>
                    {seg.reportReason && <><br />{seg.reportReason}</>}
                  </div>
                </Tooltip>
              </Polyline>
              </Fragment>
            )
          })}
        </LayerGroup>
      )}

      {/* disaster mode overlays */}
      {disaster && (
        <LayerGroup>
          {SEGMENTS.filter(s => corridorIds.includes(s.id)).map(seg => (
            <Polyline key={'dc' + seg.id} positions={seg.coords}
              pathOptions={{ color: '#1B4965', weight: 7, opacity: 0.85, dashArray: '12 8' }}>
              <Tooltip sticky>🚨 Emergency corridor: {seg.name}</Tooltip>
            </Polyline>
          ))}
          {SEGMENTS.filter(s => ['E15', 'E17', 'E18'].includes(s.id)).map(seg => (
            <Polyline key={'lk' + seg.id} positions={seg.coords}
              pathOptions={{ color: '#E08E29', weight: 5, opacity: 0.9, dashArray: '4 8' }}>
              <Tooltip sticky>Last-known accessible path (verify before use)</Tooltip>
            </Polyline>
          ))}
          {cutoffNodes.map(n => (
            <Marker key={'cut' + n} position={[NODES[n].lat, NODES[n].lng]}
              icon={divIcon(circle('#D64545', '🚧'), 30)}>
              <Popup><strong>Cut-off area:</strong> {NODES[n].name}<br />Last-known path shown amber. Relief staging at nearest open depot.</Popup>
            </Marker>
          ))}
        </LayerGroup>
      )}

      {/* planned routes */}
      {L_.routes && route && (
        <Polyline positions={route.coords} pathOptions={{ color: "#0B6E4F", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }}>
          <Tooltip sticky>Recommended (safest) — {route.distanceKm} km</Tooltip>
        </Polyline>
      )}
      {L_.routes && altRoute && (
        <Polyline positions={altRoute.coords} pathOptions={{ color: "#E08E29", weight: 7, opacity: 0.9, dashArray: "12 10", lineCap: "round", lineJoin: "round" }}>
          <Tooltip sticky>Alternate (fastest) — {altRoute.distanceKm} km</Tooltip>
        </Polyline>
      )}

      {/* selected vehicle route */}
      {L_.routes && selectedRoute && selectedRoute.length > 0 && (
        <LayerGroup>
          {SEGMENTS.filter(seg => selectedRoute.includes(seg.id)).map(seg => (
            <Polyline key={'selected-' + seg.id} positions={seg.coords} pathOptions={{ color: '#1B4965', weight: 7, opacity: 0.8, dashArray: '3 7' }}>
              <Tooltip sticky>Selected shipment route: {seg.name}</Tooltip>
            </Polyline>
          ))}
        </LayerGroup>
      )}

      {/* facilities */}
      {L_.facilities && (
        <LayerGroup>
          {FACILITIES.map(f => (
            <Marker key={f.id} position={[f.lat, f.lng]} icon={divIcon(circle('#1B4965', facilityIcon(f.type)), 30)}>
              <Popup><strong>{f.name}</strong><br />{f.type.replace('_', ' ')}{f.note ? <><br />{f.note}</> : null}</Popup>
            </Marker>
          ))}
        </LayerGroup>
      )}

      {/* cold chain (stock-status colour convention: green=ok, amber=at-risk, red=critical) */}
      {L_.coldChain && (
        <LayerGroup>
          {COLD_CHAIN.map(f => (
            <Marker key={f.id} position={[f.lat, f.lng]} icon={divIcon(circle(tempColor(f.tempStatus), '❄️'), 30)}>
              <Popup>
                <strong>{f.name}</strong><br />
                District hub · {f.capacityUnits} units · {f.utilizationPct}% utilised<br />
                <span style={{ color: tempText(f.tempStatus), fontWeight: 600 }}>{tempLabel(f.tempStatus)}</span>
              </Popup>
            </Marker>
          ))}
        </LayerGroup>
      )}

      {/* inland waterways (NW-2 Brahmaputra + Barak) */}
      {L_.waterway && (
        <LayerGroup>
          {SEGMENTS.filter(isWaterway).flatMap(seg => {
            const mid = seg.coords[Math.floor(seg.coords.length / 2)]
            return [
              <Polyline key={`w-${seg.id}`} positions={seg.coords} pathOptions={{ color: '#2E9E5B', weight: 3.5, opacity: 0.6, dashArray: '1 6' }}>
                <Tooltip sticky>🚢 {seg.name} · draft {seg.draftM} m · {seg.lengthKm} km</Tooltip>
              </Polyline>,
              <Marker key={`wm-${seg.id}`} position={mid} icon={divIcon(circle('#2E9E5B', '⛴️'), 26)}>
                <Popup><strong>{seg.name}</strong><br />River freight (NW-2 / Barak) · draft {seg.draftM} m<br />Underused capacity — PlanRoute offers it when it beats road risk.</Popup>
              </Marker>,
            ]
          })}
        </LayerGroup>
      )}

      {/* reports */}
      {(L_.reports || L_.incidents) && (
        <LayerGroup>
          {reports.filter(r => r.status !== 'rejected').map(r => (
            <CircleMarker key={r.id} center={[r.lat, r.lng]} radius={9}
              pathOptions={{
                color: r.severity === 'impassable' ? '#D64545' : r.severity === 'partial' ? '#E0A929' : '#1B4965',
                fillColor: r.severity === 'impassable' ? '#D64545' : r.severity === 'partial' ? '#E0A929' : '#1B4965',
                fillOpacity: 0.7, weight: 2,
              }}>
              <Popup><strong>{r.type}</strong> — {r.severity}<br />{r.description}<br /><em>{r.reporter} · {r.status}</em></Popup>
            </CircleMarker>
          ))}
        </LayerGroup>
      )}

      {/* weather stations */}
      {L_.weather && (
        <LayerGroup>
          {Object.values(weather).map(point => (
            <Marker key={point.id} position={[point.lat, point.lng]} icon={divIcon(circle('#1B4965', '☁️'), 30)}>
              <Popup><strong>{point.name}</strong><br />Rain now: {point.rainNow} mm/h<br />Temperature: {point.tempC}°C</Popup>
            </Marker>
          ))}
        </LayerGroup>
      )}

      {/* selected/current field location */}
      {currentLocation && (
        <Marker position={currentLocation} icon={divIcon(circle('#E08E29', '📍'), 30)}>
          <Popup>Selected location</Popup>
        </Marker>
      )}

      {/* alert markers — every unresolved alert that has a map position, colour-coded
          by severity so the Alerts layer matches the alerts list (high/medium/low). */}
      {L_.alerts && (
        <LayerGroup>
          {alerts.filter(a => !a.resolved && a.lat != null && a.lng != null).slice(0, 12).map(a => {
            const color = a.severity === 'high' ? '#D64545' : a.severity === 'medium' ? '#E08E29' : '#1B4965'
            return (
              <Marker key={a.id} position={[a.lat!, a.lng!]} icon={divIcon(`<div class="pulse-dot pulse-dot--${a.severity}" style="background:${color}"></div>`, 18)}>
                <Popup><strong>{a.title}</strong><br />{a.message}</Popup>
              </Marker>
            )
          })}
        </LayerGroup>
      )}

      {/* vehicles */}
      {(L_.vehicles || L_.shipments) && (
        <LayerGroup>
          {vehicles.map(v => {
            const bg = v.status === 'delivered' ? '#64748b' : v.status === 'halted' ? '#D64545' : v.status === 'delayed' ? '#E08E29' : '#0B6E4F'
            const emoji = v.status === 'delivered' ? '✅' : v.lastMile ? '🚐' : v.cargo === 'fuel' ? '🛢️' : '🚛'
            const big = selectedVehicleId === v.id
            return (
              <Marker key={v.id} position={[v.lat, v.lng]}
                icon={divIcon(vehicleIcon(bg, emoji, big ? '#E08E29' : '#fff', v.status === 'moving' || v.status === 'delayed' ? v.headingDeg : undefined, v.telemetry, big), big ? 38 : 30)}
                zIndexOffset={big ? 1000 : 0}>
                <Popup>
                  <strong>{v.id}</strong> {v.lastMile ? '· last-mile' : ''}<br />
                  {v.cargoDetail}<br />
                  {v.from} → {v.to}<br />
                  Status: <strong style={{ color: bg }}>{v.status.toUpperCase()}</strong>
                  {v.delayHours > 0 && <> · delay {v.delayHours}h</>}
                  {v.status !== 'delivered' && v.etaHours != null && <><br />ETA ~{v.etaHours}h · {v.remainingKm} km left · {Math.round(v.speedKmph)} km/h</>}
                  <br />
                  <span style={{ display: 'inline-block', marginTop: 4, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800, color: '#fff', background: v.telemetry === 'gps' ? '#2E9E5B' : '#64748b' }}>
                    {v.telemetry === 'gps' ? 'REAL GPS' : 'SIMULATED'}
                  </span>
                  {v.lastFixAt ? <span style={{ fontSize: 10, color: '#64748b' }}> · fix {timeAgo(v.lastFixAt)}</span> : null}
                  {!online && <><br /><em>cached position</em></>}
                </Popup>
              </Marker>
            )
          })}
          {/* trail polylines for selected */}
          {selectedVehicleId && vehicles.filter(v => v.id === selectedVehicleId).map(v =>
            v.trail.length > 1 ? (
              <Polyline key={'tr' + v.id} positions={v.trail} pathOptions={{ color: '#1B4965', weight: 3, opacity: 0.5, dashArray: '5 6' }} />
            ) : null
          )}
        </LayerGroup>
      )}
    </MapContainer>
    {showSources && <SourcesLegend />}
    </div>
  )
}