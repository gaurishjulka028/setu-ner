import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Navigation, Truck, Filter, X, Clock, MapPin, PackageCheck, Play, Radio, Trash2, Satellite } from 'lucide-react'
import MapView from '../components/MapView'
import RiskTrendChart, { routeTrend, REROUTE_LOOKAHEAD_RISK } from '../components/RiskTrend'
import { Card, SectionTitle, Button, Pill, statusPill, RowSkeleton, EmptyState } from '../components/ui'
import { useToast } from '../components/Toast'
import { useStore } from '../store/useStore'
import { api, ApiError } from '../lib/api'
import { CARGO_LABEL, timeAgo } from '../lib/format'
import { SEGMENTS } from '../data/ner'
import { riskOf } from '../lib/risk'

// ── "Share my live location" — turns the browser/phone into the vehicle's
// GPS tracker. Posts navigator.geolocation fixes to
// POST /api/vehicles/:id/position/driver (JWT auth, operator+ roles) every
// few seconds; the server then drives that vehicle from real fixes instead
// of the simulation and marks it telemetry:'gps' for everyone.
function useLiveShare(vehicleId: string | null, showToast: (m: string, k?: 'error' | 'info' | 'success') => void) {
  const [sharing, setSharing] = useState(false)
  const [lastFix, setLastFix] = useState<{ at: number; acc: number } | null>(null)
  const watchId = useRef<number | null>(null)
  const lastSent = useRef(0)

  const stop = () => {
    if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setSharing(false)
  }

  const start = () => {
    if (!vehicleId) return
    if (!navigator.geolocation) { showToast('This device has no geolocation support.', 'error'); return }
    if (!window.isSecureContext) { showToast('Location sharing needs HTTPS (or localhost) — open the app over https.', 'error'); return }
    setSharing(true)
    watchId.current = navigator.geolocation.watchPosition(async pos => {
      const now = Date.now()
      if (now - lastSent.current < 3000) return // ≤1 fix / 3 s
      lastSent.current = now
      const { latitude, longitude, speed, heading, accuracy } = pos.coords
      try {
        await api.post(`/api/vehicles/${encodeURIComponent(vehicleId)}/position/driver`, {
          lat: latitude, lng: longitude,
          speedKmph: Math.max(0, Math.min(200, (speed ?? 0) * 3.6)),
          headingDeg: heading != null && !Number.isNaN(heading) ? heading : undefined,
          ts: pos.timestamp,
        })
        setLastFix({ at: now, acc: Math.round(accuracy) })
      } catch (e) {
        stop()
        showToast(e instanceof ApiError && e.status === 403 ? 'Only operator / logistics / official accounts can share a vehicle position.' : 'Could not send location — check your connection.', 'error')
      }
    }, err => {
      stop()
      showToast(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not read device location.', 'error')
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 })
  }

  useEffect(() => () => stop(), [vehicleId])
  return { sharing, lastFix, start, stop }
}

export default function Track() {
  const { t } = useTranslation()
  const { vehicles, bookings, confirmLastMile, activeTrackingId, weather, season, alerts, initialLoad, user, removeShipment } = useStore()
  const { showToast } = useToast()
  const [params] = useSearchParams()
  const shipmentParam = params.get('shipment')
  const [cargoFilter, setCargoFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // Track by id, not by object: the fleet array is replaced on every socket
  // push, so a captured Vehicle object would freeze at the position it had
  // when clicked (the "truck never moves in the side panel" bug).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => vehicles.find(v => v.id === selectedId) ?? null, [vehicles, selectedId])
  const setSelected = (v: { id: string } | null) => setSelectedId(v?.id ?? null)
  const [replay, setReplay] = useState<number | null>(null) // snapshot index
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const canShare = Boolean(user && ['operator', 'logistics', 'official', 'admin'].includes(user.role))
  const live = useLiveShare(selectedId, showToast)

  const handleConfirmLastMile = async (bookingId: string) => {
    setConfirmingId(bookingId)
    try {
      await confirmLastMile(bookingId)
    } catch (e) {
      console.error('Failed to confirm last-mile delivery:', e)
      showToast('Could not confirm delivery — check your connection and try again.', 'error')
    } finally {
      setConfirmingId(null)
    }
  }

  useEffect(() => {
    if (!selectedId && (shipmentParam || activeTrackingId)) {
      const active = vehicles.find(vehicle => vehicle.id === (shipmentParam || activeTrackingId))
      if (active) {
        setSelectedId(active.id)
        setReplay(null)
      }
    }
  }, [activeTrackingId, shipmentParam, vehicles, selectedId])

  const filtered = useMemo(() => vehicles.filter(v =>
    (cargoFilter === 'all' || v.cargo === cargoFilter) &&
    (statusFilter === 'all' || v.status === statusFilter)), [vehicles, cargoFilter, statusFilter])

  const snapshots = useStore(s => s.snapshots)

  const focus = selected ? [selected.lat, selected.lng] as [number, number] : null
  const currentSegments = selected ? SEGMENTS.filter(segment => selected.path.includes(segment.id)) : []
  const disruptedSegments = currentSegments.filter(segment => riskOf(segment, weather, season).status !== 'open')
  const affectedAlert = selected ? alerts.find(alert => alert.segmentId && selected.path.includes(alert.segmentId) && alert.severity !== 'low') : undefined
  const disruption = disruptedSegments[0] || (affectedAlert?.segmentId ? SEGMENTS.find(segment => segment.id === affectedAlert.segmentId) : undefined)
  const nextStop = currentSegments[0]?.to ?? selected?.to ?? 'Destination'
  // ETA comes from the engine (remaining km along the actual route at the
  // vehicle's current speed) rather than a flat 40 km/h guess.
  const eta = !selected ? '—'
    : selected.status === 'delivered' ? 'Arrived'
    : selected.status === 'halted' ? `Indefinite (${selected.delayHours}h delay)`
    : selected.etaHours != null ? `${formatH(selected.etaHours)} · ${selected.remainingKm ?? '?'} km left`
    : `${Math.max(1, Math.round(currentSegments.reduce((total, segment) => total + segment.lengthKm, 0) / 40))}h remaining`

  // Weather-driven disruption: aggregate the engine's 48 h risk history +
  // forecast along the tracked path so we can flag a corridor that is still
  // open but is forecast to cross the reroute threshold (rising trend).
  const shipTrend = useMemo(() => (selected ? routeTrend(selected.path, weather, season) : null), [selected, weather, season])
  const riskRising = Boolean(shipTrend && !disruption && shipTrend.read === 'rising' && shipTrend.futurePeak >= REROUTE_LOOKAHEAD_RISK)

  return (
    <div className="grid min-h-full lg:grid-cols-[400px_1fr]">
      <div className="space-y-3 overflow-auto bg-canvas p-3 thin-scroll sm:p-4 lg:max-h-[calc(100vh-7rem)]">
        <Card className="p-4">
          <SectionTitle icon={<Navigation size={18} />} title={t('track.title')} sub={t('track.sub')} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="font-bold text-slate-500 flex items-center gap-1"><Filter size={11} />{t('common.cargo')}</span>
              <select value={cargoFilter} onChange={e => setCargoFilter(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="all">{t('common.allTypes')}</option>
                {Object.entries(CARGO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="font-bold text-slate-500">{t('common.status')}</span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="all">All</option>
                <option value="moving">{t('track.moving')}</option>
                <option value="delayed">Delayed</option>
                <option value="halted">{t('track.halted')}</option>
              </select>
            </label>
          </div>
        </Card>

        <div className="space-y-2">
          {initialLoad ? (
            <><RowSkeleton lines={3} /><RowSkeleton lines={3} /><RowSkeleton lines={3} /><RowSkeleton lines={3} /></>
          ) : filtered.length ? (
            filtered.map(v => (
              <Card key={v.id} className={`p-3 cursor-pointer transition hover:border-primary ${selected?.id === v.id ? 'ring-2 ring-primary' : ''}`} >
                <button onClick={() => { setSelected(v); setReplay(null) }} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{v.lastMile ? '🚐' : v.cargo === 'fuel' ? '🛢️' : '🚛'}</span>
                      <div>
                        <div className="font-mono text-[12px] font-bold text-slate-800">{v.id}</div>
                        <div className="text-[10px] text-slate-500">{v.org}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white ${v.telemetry === 'gps' ? 'bg-success' : 'bg-slate-400'}`} title={v.telemetry === 'gps' ? 'Real GPS fix from a device' : 'Server simulation along planned route'}>{v.telemetry === 'gps' ? 'GPS' : 'SIM'}</span>
                      {statusPill(v.status)}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1.5 font-semibold flex items-center gap-1">
                    {v.from} <span className="text-slate-400">→</span> {v.to}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{CARGO_LABEL[v.cargo]} · {v.cargoDetail.slice(0, 42)}{v.cargoDetail.length > 42 ? '…' : ''}</div>
                  {v.delayHours > 0 && <div className="text-[10px] text-hazard font-bold mt-1">{t('track.delayedBy')} {v.delayHours}h</div>}
                  {v.lastMile && <div className="text-[10px] text-secondary font-bold mt-1">🤝 {v.community}</div>}
                </button>
              </Card>
            ))
          ) : (
            <EmptyState icon={<Truck size={18} />} title="No shipments match these filters" body="Try a different cargo type or status, or clear the filters above." />
          )}
        </div>
      </div>

      <div className="relative min-h-[680px] lg:min-h-[calc(100vh-7rem)]">
        <MapView
          layers={{ roads: true, routes: true, vehicles: true, shipments: true, incidents: true, alerts: true, facilities: false }}
          focus={focus} focusZoom={10}
          selectedVehicleId={selected?.id}
          selectedRoute={selected?.path}
        />
        {selected && (
          <div className="absolute left-3 top-3 z-[600] w-[min(92vw,360px)] space-y-3">
            {params.get('updated') === '1' && (
              <Card className="border-l-4 !border-l-success bg-success-light p-3">
                <div className="text-sm font-bold text-success">✓ Route Updated</div>
                <div className="mt-1 text-xs text-slate-700">Shipment {selected.id} is now using the alternative route.</div>
              </Card>
            )}
            {disruption && (
              <Card className="border-l-4 !border-l-hazard bg-hazard-light p-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-hazard"><AlertTriangle size={16} /> ROUTE DISRUPTION DETECTED</div>
                <div className="mt-1 text-xs font-semibold text-slate-700">{affectedAlert?.title ?? `${disruption.name} is affected.`}</div>
                <div className="mt-1 text-[11px] text-slate-600">Current route is affected. Find a safer alternative while preserving this shipment.</div>
                <Link to={`/plan-route?shipment=${encodeURIComponent(selected.id)}&reroute=1`} className="mt-3 inline-flex items-center justify-center rounded-lg bg-hazard px-3 py-2 text-xs font-bold text-white transition hover:brightness-95">Find Alternative Route</Link>
              </Card>
            )}
            {riskRising && shipTrend && (
              <Card className="border-l-4 !border-l-accent bg-accent-light/60 p-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-accent-text"><AlertTriangle size={16} /> WEATHER RISK RISING</div>
                <div className="mt-1 text-xs font-semibold text-slate-700">Route open now, but 24–48 h forecast peaks at {shipTrend.futurePeak}/100 (threshold {REROUTE_LOOKAHEAD_RISK}).</div>
                <div className="mt-1 text-[11px] text-slate-600">Proactive reroute is cheaper than waiting for a block. Detours are still open at current conditions.</div>
                <Link to={`/plan-route?shipment=${encodeURIComponent(selected.id)}&reroute=1`} className="mt-3 inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white transition hover:brightness-95">Plan Proactive Reroute</Link>
              </Card>
            )}
            <Card className="p-3">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <Detail label="Shipment ID" value={selected.id} />
                <Detail label="Cargo" value={CARGO_LABEL[selected.cargo]} />
                <Detail label="Origin" value={selected.from} />
                <Detail label="Destination" value={selected.to} />
                <Detail label="Current location" value={`${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`} />
                <Detail label="Position source" value={selected.telemetry === 'gps' ? `Real GPS${selected.lastFixAt ? ` · ${timeAgo(selected.lastFixAt)}` : ''}` : 'Simulated (server)'} />
                <Detail label="ETA" value={eta} />
                <Detail label="Speed" value={`${Math.round(selected.speedKmph)} km/h${selected.headingDeg != null ? ` · ${selected.headingDeg}°` : ''}`} />
                <Detail label="Next stop" value={nextStop} />
                <Detail label="Route status" value={selected.routeStatus === 'replaced' ? 'Alternative route active' : disruption ? 'Affected' : 'Active'} />
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-600">Current route: <span className="font-mono font-semibold">{selected.path.join(' → ')}</span></div>
            </Card>
          </div>
        )}
        {replay !== null && snapshots.length > 0 && (
          <ReplayOverlay index={replay} />
        )}

        {/* detail panel */}
        {selected && (
          <div className="absolute bottom-3 right-3 z-[600] w-[min(calc(100vw-1.5rem),340px)] slide-in lg:top-3 lg:bottom-auto">
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono font-bold text-sm text-slate-800 flex items-center gap-2">
                    {selected.lastMile ? '🚐' : '🚛'} {selected.id}
                  </div>
                  <div className="text-[11px] text-slate-500">{selected.org}</div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close shipment details" className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"><X size={16} /></button>
              </div>

              <div className="mt-3 space-y-1.5 text-[12px]">
                <Row icon={<PackageCheck size={13} />} label={t('track.cargo')} value={`${CARGO_LABEL[selected.cargo]} — ${selected.cargoDetail}`} />
                <Row icon={<Truck size={13} />} label={t('track.driver')} value={selected.driver} />
                <Row icon={<MapPin size={13} />} label={t('track.route')} value={`${selected.from} → ${selected.to}`} />
                <Row icon={<Clock size={13} />} label={t('common.eta')}
                  value={selected.status === 'halted' ? `Indefinite (${selected.delayHours}h delay)` : selected.delayHours > 0 ? `+${selected.delayHours}h delay` : t('track.onTime')} />
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {statusPill(selected.status)}
                <Pill tone={selected.telemetry === 'gps' ? 'green' : 'blue'}>{selected.telemetry === 'gps' ? '📡 real GPS' : '🖥 simulated'}</Pill>
              </div>

              {/* Real telemetry: this device becomes the tracker */}
              {canShare && selected.status !== 'delivered' && (
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1"><Satellite size={12} /> Share this device's GPS</div>
                      <div className="text-[10px] text-slate-500">{live.sharing ? (live.lastFix ? `sending · last fix ${timeAgo(live.lastFix.at)} · ±${live.lastFix.acc} m` : 'waiting for first fix…') : 'Drive with this phone → the map shows the real position'}</div>
                    </div>
                    <Button variant={live.sharing ? 'secondary' : 'primary'} className="text-[11px] py-1.5 px-2.5 shrink-0" onClick={live.sharing ? live.stop : live.start}>
                      <Radio size={12} /> {live.sharing ? 'Stop' : 'Start'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Delivered app shipments can be cleared off the map */}
              {(selected.status === 'delivered' || selected.id.startsWith('SHIP-')) && (user?.role === 'official' || user?.role === 'admin' || selected.id.startsWith('SHIP-')) && (
                <button disabled={removing} onClick={async () => {
                  setRemoving(true)
                  try { await removeShipment(selected.id); setSelectedId(null); showToast('Shipment removed from the live fleet.', 'success') }
                  catch { showToast('Could not remove shipment.', 'error') }
                  finally { setRemoving(false) }
                }} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-hazard">
                  <Trash2 size={12} /> {removing ? 'Removing…' : selected.status === 'delivered' ? 'Clear delivered shipment' : 'Cancel this shipment'}
                </button>
              )}

              {/* 48 h weather-risk history + forecast on the tracked route */}
              {shipTrend && shipTrend.segIds.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 px-2 pt-1.5 pb-1">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400">48h weather-risk trend</span>
                    <span className="text-[9px] text-slate-400 font-semibold">dashed = forecast</span>
                  </div>
                  <RiskTrendChart stats={shipTrend} height={80} />
                </div>
              )}

              {/* timeline replay */}
              {snapshots.length > 2 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => setReplay(replay === null ? snapshots.length - 1 : null)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-secondary">
                    <Play size={12} /> {t('track.replay')}
                  </button>
                  {replay !== null && (
                    <input type="range" min={0} max={snapshots.length - 1} value={replay}
                      onChange={e => setReplay(Number(e.target.value))}
                      className="w-full mt-2 accent-primary" />
                  )}
                  {replay !== null && <div className="text-[10px] text-slate-400 mt-1">{timeAgo(snapshots[replay].t)}</div>}
                </div>
              )}

              {/* last-mile handoff */}
              {(() => {
                const b = bookings.find(x => x.vehicleId === selected.id)
                if (!b) return null
                const received = b.villageReceived
                return (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[11px] font-bold text-slate-700">{t('track.lastMile')}</div>
                    <div className="text-[10px] text-slate-500 mb-2">{t('track.lastMileBody')}</div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold">
                      <Stage done={b.warehouseOut} label="WH" />
                      <span className="flex-1 h-0.5 bg-slate-200" />
                      <Stage done={b.depotReached} label="DPT" />
                      <span className="flex-1 h-0.5 bg-slate-200" />
                      <Stage done={b.villageReceived} label="VIL" />
                    </div>
                    {!received && (selected.lastMile || b.lastMile) && (
                      <Button variant="primary" className="w-full mt-2 !bg-success text-[12px] py-1.5"
                        disabled={confirmingId === b.id}
                        onClick={() => handleConfirmLastMile(b.id)}>
                        {confirmingId === b.id ? 'Confirming…' : <>✓ {t('track.received')}</>}
                      </Button>
                    )}
                    {received && <div className="mt-2 text-[11px] text-success font-bold">✓ Delivery loop closed at village level</div>}
                  </div>
                )
              })()}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function formatH(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  const whole = Math.floor(h)
  return `${whole}h ${Math.round((h - whole) * 60)}m`
}

function Row({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div><span className="text-slate-400">{label}: </span><span className="font-semibold text-slate-700">{value}</span></div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="truncate font-semibold text-slate-700">{value}</div></div>
}

function Stage({ done, label }: { done?: boolean; label: string }) {
  return (
    <span className={`px-2 py-1 rounded-full ${done ? 'bg-success text-white' : 'bg-slate-100 text-slate-400'}`}>{label}</span>
  )
}

function ReplayOverlay({ index }: { index: number }) {
  return (
    <div className="absolute bottom-3 left-3 z-[600] bg-secondary text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-2">
      <Play size={12} /> Replaying movement · snapshot {index + 1}
    </div>
  )
}
