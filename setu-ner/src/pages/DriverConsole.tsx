import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Truck, MapPin, AlertTriangle, CloudRain, Gauge, Loader2, Navigation,
  Clock, Radio,
} from 'lucide-react'
import { Card, SectionTitle, Button, Pill, EmptyState } from '../components/ui'
import MapView from '../components/MapView'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { SEGMENTS } from '../data/ner'
import { riskOf, computeCongestionCounts } from '../lib/risk'
import { CARGO_LABEL } from '../lib/format'

// ── Driver Console (role: operator) ────────────────────────────────────────
// The one page a driver actually needs while rolling:
//   • pick your vehicle once (remembered on this device) — the fleet is
//     seeded/simulated, so there is no login→vehicle binding to inherit
//   • live assignment card: status, cargo, route progress, ETA, delay
//   • hazards ahead: every caution/blocked segment still on the route, with
//     the risk score and reason
//   • share GPS from this phone (same endpoint the driver app uses)
const DRIVER_VEHICLE_KEY = 'setu-driver-vehicle'

type LiveShare = { ok?: boolean; lat: number; lng: number; speedKmph?: number; at: number; error?: string }

/** Shares this device's geolocation as the vehicle's live position (driver role). */
function useLiveShare(vehicleId: string | null, showToast: (m: string, t?: 'success' | 'error') => void) {
  const [last, setLast] = useState<LiveShare | null>(null)
  const [busy, setBusy] = useState(false)
  const share = async () => {
    if (!vehicleId || busy) return
    setBusy(true)
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10_000 }))
      // Server schema requires numeric lat/lng/speedKmph — geolocation speed
      // is m/s (often null when stationary), so convert and default to 0.
      const payload = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speedKmph: Math.max(0, Math.round(((pos.coords.speed ?? 0) * 3600) / 1000)),
      }
      await api.post(`/api/vehicles/${encodeURIComponent(vehicleId)}/position/driver`, payload)
      setLast({ ...payload, at: Date.now() })
      showToast('Position shared with the control room.', 'success')
    } catch (e) {
      const geo = e as { code?: number }
      const msg = geo?.code === 1 || geo?.code === 2 || geo?.code === 3
        ? 'Location unavailable — enable GPS / allow location for this site to share your position.'
        : 'Could not share position — the API must be reachable (403 = your role cannot share for this vehicle).'
      showToast(msg, 'error')
    } finally { setBusy(false) }
  }
  return { last, busy, share }
}

export default function DriverConsole() {
  const { t } = useTranslation()
  const { vehicles, weather, season, alerts, segmentsVersion, user } = useStore()
  const { showToast } = useToast()
  const [vehicleId, setVehicleId] = useState<string>(() => {
    try { return localStorage.getItem(DRIVER_VEHICLE_KEY) ?? '' } catch { return '' }
  })

  useEffect(() => {
    try { if (vehicleId) localStorage.setItem(DRIVER_VEHICLE_KEY, vehicleId) } catch { /* noop */ }
  }, [vehicleId])

  const vehicle = vehicles.find(v => v.id === vehicleId) ?? null
  const { busy: shareBusy, share } = useLiveShare(vehicleId, showToast)

  // Hazards ahead: every non-open segment on the vehicle's remaining path.
  // "Remaining" = segments whose cumulative length starts after progressKm.
  const congestionCounts = useMemo(() => computeCongestionCounts(vehicles), [vehicles])
  const hazards = useMemo(() => {
    if (!vehicle) return []
    let acc = 0
    const passed = new Set<string>()
    for (const id of vehicle.path) {
      if (acc >= vehicle.progressKm) break
      passed.add(id)
      acc += SEGMENTS.find(sg => sg.id === id)?.lengthKm ?? 20
    }
    return SEGMENTS
      .filter(sg => vehicle.path.includes(sg.id))
      .map(sg => ({ seg: sg, risk: riskOf(sg, weather, season, congestionCounts), ahead: !passed.has(sg.id) }))
      .filter(h => h.risk.status !== 'open')
      .sort((a, b) => (b.ahead ? 1 : 0) - (a.ahead ? 1 : 0) || b.risk.total - a.risk.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, weather, season, congestionCounts, segmentsVersion])

  const routeAlerts = alerts.filter(a => !a.resolved && (!vehicle || !a.segmentId || vehicle.path.includes(a.segmentId))).slice(0, 5)


  const statPill = (status: string) =>
    status === 'moving' ? <Pill tone="green">● moving</Pill>
      : status === 'delayed' ? <Pill tone="amber">▲ delayed</Pill>
        : status === 'halted' ? <Pill tone="red">■ halted</Pill>
          : <Pill tone="blue">✓ delivered</Pill>

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <Card className="p-4 flex flex-wrap items-center gap-4 justify-between">
        <SectionTitle icon={<Truck size={18} />} title={t('driver.title')} sub={t('driver.sub')} />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">{t('driver.myVehicle')}</span>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-primary">
            <option value="">— {t('driver.pickVehicle')} —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} · {v.driver} · {v.from}→{v.to}</option>)}
          </select>
        </div>
      </Card>

      {!vehicle ? (
        <Card className="p-8"><EmptyState icon={<Truck size={22} />} title={t('driver.pickVehicleTitle')} body={t('driver.pickVehicleBody')} /></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{vehicle.id}</span>
                {statPill(vehicle.status)}
              </div>
              <div className="mt-2 text-lg font-extrabold text-slate-800">{vehicle.driver}</div>
              <div className="text-[11px] text-slate-500">{CARGO_LABEL[vehicle.cargo]} · {vehicle.weightT}t · {vehicle.org}</div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><MapPin size={12} /> {vehicle.from} → {vehicle.to}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('common.eta')}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-primary">{vehicle.etaHours != null ? `${vehicle.etaHours}h` : '—'}</span>
                {vehicle.remainingKm != null && <span className="text-[11px] font-semibold text-slate-400">{Math.round(vehicle.remainingKm)} km left</span>}
              </div>
              {vehicle.delayHours > 0 && <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-hazard"><Clock size={11} /> delayed {vehicle.delayHours}h</div>}
            </Card>
            <Card className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('driver.routeStatus')}</div>
              <div className="mt-2">
                {vehicle.routeStatus === 'disrupted' ? <Pill tone="red">route disrupted</Pill>
                  : vehicle.routeStatus === 'replaced' ? <Pill tone="amber">rerouted</Pill>
                    : <Pill tone="green">route active</Pill>}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">{vehicle.path.length} segments · {vehicle.lastMile ? 'includes last-mile' : 'trunk haul'}</div>
            </Card>
            <Card className="p-4 flex flex-col gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('driver.actions')}</div>
              <Button variant="primary" onClick={share} disabled={shareBusy} className="w-full">
                {shareBusy ? <Loader2 size={14} className="animate-spin" /> : <><Radio size={14} /> {t('driver.shareGps')}</>}
              </Button>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="overflow-hidden flex flex-col h-full">
              <div className="border-b border-slate-100 bg-panel-gradient px-4 py-3">
                <SectionTitle icon={<Navigation size={16} />} title={t('driver.liveMap')} sub={`${vehicle.lat.toFixed(3)}, ${vehicle.lng.toFixed(3)}`} />
              </div>
              <div className="flex-1 min-h-[300px]">
                <MapView layers={{ roads: true, routes: true, riskZones: true, accessibility: false, weather: false, vehicles: true, facilities: false, alerts: true }} focus={[vehicle.lat, vehicle.lng]} focusZoom={11} />
              </div>
            </Card>

            <div className="space-y-4">
              {alerts.filter(a => !a.resolved && a.type === 'disaster' && a.severity === 'high').slice(0, 1).map(a => (
                <Card key={a.id} className="p-4 border-hazard/40 bg-hazard-light/40">
                  <SectionTitle icon={<AlertTriangle size={16} />} title="Disaster alert" sub="Emergency instructions from the control room" />
                  <div className="mt-2 text-[12px] font-extrabold text-slate-800">{a.title}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{a.message}</div>
                  <div className="mt-2 rounded-lg border border-hazard/30 bg-white/70 p-2 text-[11px] font-bold text-hazard">Action: {a.action}</div>
                </Card>
              ))}

              <Card className="p-4">
                <SectionTitle icon={<AlertTriangle size={16} />} title={t('driver.hazardsAhead')}
                  sub={hazards.length ? `${hazards.filter(h => h.ahead).length} ${t('driver.hazardsOnPath')} · ${hazards.length} ${t('driver.onRoute')}` : t('driver.noHazards')} />
                {hazards.length ? (
                  <div className="mt-2 space-y-2">
                    {hazards.slice(0, 6).map(h => (
                      <div key={h.seg.id} className="flex items-center gap-2.5 rounded-lg border border-slate-100 p-2.5">
                        <Pill tone={h.risk.status === 'blocked' ? 'red' : 'amber'}>{h.risk.status}</Pill>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-bold text-slate-700 truncate">{h.seg.name}{h.ahead && <span className="ml-1.5 text-[10px] font-black text-hazard">AHEAD</span>}</div>
                          <div className="text-[10px] text-slate-400 truncate">{h.seg.road} · risk {h.risk.total}/100{h.seg.reportReason ? ` · ${h.seg.reportReason}` : ''}</div>
                        </div>
                        <Gauge size={14} className={h.risk.total >= 66 ? 'text-hazard' : 'text-accent'} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<CloudRain size={18} />} title={t('driver.pathClear')} body={t('driver.pathClearBody')} />
                )}
              </Card>

              <Card className="p-4">
                <SectionTitle icon={<AlertTriangle size={16} />} title={t('driver.alertsForRoute')} />
                {routeAlerts.length ? (
                  <div className="mt-2 space-y-2">
                    {routeAlerts.map(a => (
                      <div key={a.id} className="rounded-lg border border-slate-100 p-2.5">
                        <div className="flex items-center gap-2">
                          <Pill tone={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'amber' : 'blue'}>{a.type}</Pill>
                          <span className="text-[11px] font-bold text-slate-600 truncate">{a.title}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{a.action}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Navigation size={18} />} title={t('driver.noRouteAlerts')} body={t('driver.noRouteAlertsBody')} />
                )}
                <div className="mt-3 flex gap-2">
                  <Link to="/plan-route" className="flex-1"><Button variant="secondary" className="w-full">{t('driver.planAlt')}</Button></Link>
                  <Link to="/report" className="flex-1"><Button variant="accent" className="w-full">{t('driver.reportIssue')}</Button></Link>
                </div>
              </Card>

              <p className="text-[10px] leading-relaxed text-slate-400 px-1">
                {t('driver.shareNote')}{' '}
                {user?.phone ? `${t('driver.registeredPhone')} +${user.phone}.` : ''}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
