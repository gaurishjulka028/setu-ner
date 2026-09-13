import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Route as RouteIcon, Clock, Gauge, AlertTriangle, ArrowRight, RefreshCw, Users, CloudRain, Ship } from 'lucide-react'
import MapView from '../components/MapView'
import RiskTrendChart, { routeTrend, REROUTE_LOOKAHEAD_RISK } from '../components/RiskTrend'
import { Card, SectionTitle, Button, Pill } from '../components/ui'
import { useToast } from '../components/Toast'
import { ApiError, API_ORIGIN } from '../lib/api'
import { useStore } from '../store/useStore'
import { accessibilityScore, townOptions, riskOf, convoyWindow, waterwayBetterThanRoad, computeCongestionCounts } from '../lib/risk'
import { api } from '../lib/api'
import { SEGMENTS, isWaterway } from '../data/ner'
import { CARGO_LABEL } from '../lib/format'
import type { CargoType, RouteResult, Season, WeatherPoint } from '../types'

export default function PlanRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { weather, season, startTracking, replaceTrackingRoute, vehicles, user, segmentsVersion } = useStore()
  const { showToast } = useToast()
  const [routeError, setRouteError] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const [params] = useSearchParams()
  const rerouteShipmentId = params.get('shipment')
  const rerouteVehicle = vehicles.find(vehicle => vehicle.id === rerouteShipmentId)
  const isReroute = Boolean(rerouteVehicle)
  const isAlternativeSearch = isReroute || Boolean(params.get('exclude') || params.get('report'))
  const queryFrom = params.get('from') || 'Guwahati'
  const queryTo = params.get('to') || 'Haflong (Dima Hasao)'
  const queryCargo = (params.get('cargo') as CargoType | null) || 'medicine'
  const towns = useMemo(() => townOptions(), [])
  const [from, setFrom] = useState(rerouteVehicle?.from ?? queryFrom)
  const [to, setTo] = useState(rerouteVehicle?.to ?? queryTo)
  const [cargo, setCargo] = useState<CargoType>(rerouteVehicle?.cargo ?? queryCargo)
  const [weightKg, setWeightKg] = useState(1000)
  const [priority, setPriority] = useState<'standard' | 'priority' | 'urgent'>('priority')
  const [vehicleType, setVehicleType] = useState('')
  const [deadline, setDeadline] = useState('')
  const [result, setResult] = useState<{ primary: RouteResult | null; alternate: RouteResult | null } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'primary' | 'alternate' | 'water' | null>(null)
  const [useWater, setUseWater] = useState(false)
  const excludedRoute = useMemo(() => (rerouteVehicle?.path ?? (params.get('exclude') ? [params.get('exclude')!] : [])).filter(id => {
    const segment = SEGMENTS.find(item => item.id === id)
    return segment ? riskOf(segment, weather, season).status !== 'open' : false
  }) ?? [], [rerouteVehicle?.path, weather, season, segmentsVersion])

  // Part 3 step 6: route computation now happens server-side (same
  // planRoutes()/dijkstra logic, ported verbatim in server/src/engine/risk.ts)
  // — this just calls it instead of importing and running it in the browser.
  const requestRoute = async (origin: string, destination: string, cargoType: CargoType, exclude: string[]) => {
    setRouteLoading(true)
    setRouteError(null)
    if (origin === destination) {
      setRouteLoading(false)
      setResult(null)
      setRouteError('Origin and destination are the same — pick two different towns.')
      return
    }
    try {
      const data = await api.post<{ primary: RouteResult | null; alternate: RouteResult | null }>('/api/route-suggestion', {
        origin, destination, cargo: cargoType, season, excludeSegmentIds: exclude,
      })
      setResult(data)
    } catch (e) {
      console.error('Route suggestion failed:', e)
      setResult(null)
      setRouteError(e instanceof ApiError && e.status < 500
        ? e.message
        : 'Could not reach the routing service. Make sure the API server is running, then try again.')
    } finally {
      setRouteLoading(false)
    }
  }

  useEffect(() => {
    if (!rerouteVehicle) {
      if (params.get('exclude') && params.get('from') && params.get('to')) {
        requestRoute(queryFrom, queryTo, queryCargo, excludedRoute)
      }
      return
    }
    setFrom(rerouteVehicle.from)
    setTo(rerouteVehicle.to)
    setCargo(rerouteVehicle.cargo)
    setWeightKg(Math.max(1, Math.round(rerouteVehicle.weightT * 1000)))
    requestRoute(rerouteVehicle.from, rerouteVehicle.to, rerouteVehicle.cargo, excludedRoute)
    setSelectedMode(null)
  }, [rerouteVehicle?.id, weather, season, excludedRoute, queryFrom, queryTo, queryCargo, params])

  const plan = () => {
    setSelectedMode(null)
    setUseWater(false)
    requestRoute(from, to, cargo, isReroute ? excludedRoute : [])
  }

  // Waterway alternative: when the parallel river corridor scores lower risk
  // than the road link between the same towns, surface it as underused
  // NW-2 capacity (barge ~14 km/h, draft checked for this cargo).
  const waterAlt = useMemo(() => waterwayBetterThanRoad(from, to, weather, season, cargo), [from, to, weather, season, cargo])
  const waterRoute: RouteResult | null = useMemo(() => {
    if (!waterAlt) return null
    const seg = waterAlt.waterway
    return {
      mode: 'safe', segIds: [seg.id], distanceKm: Math.round(seg.lengthKm * 10) / 10,
      timeHours: Math.round((seg.lengthKm / 14) * 10) / 10, riskMax: waterAlt.waterwayRisk,
      delayHours: 0, delayReason: 'River freight: barge speed 14 km/h, time-flexible', coords: seg.coords, blockedAhead: [],
    }
  }, [waterAlt])

  const selectedRoute = selectedMode === 'primary' ? result?.primary : selectedMode === 'alternate' ? result?.alternate : useWater ? waterRoute : null
  const routeAccessibility = (route: RouteResult) => {
    if (!route.segIds.length) return 0
    return Math.round(route.segIds.reduce((sum, id) => {
      const segment = SEGMENTS.find(item => item.id === id)
      return sum + (segment ? accessibilityScore(segment, weather, season) : 0)
    }, 0) / route.segIds.length)
  }

  const beginTracking = async () => {
    if (!selectedRoute || tracking) return
    if (!user) {
      showToast('Sign in to start tracking a shipment.', 'info')
      navigate(`/login?next=${encodeURIComponent('/plan-route')}`)
      return
    }
    setTracking(true)
    try {
      if (isReroute && rerouteShipmentId) {
        await replaceTrackingRoute({ shipmentId: rerouteShipmentId, route: selectedRoute })
        navigate(`/track?shipment=${encodeURIComponent(rerouteShipmentId)}&updated=1`)
        return
      }
      const shipmentId = await startTracking({ route: selectedRoute, from, to, cargo, weightKg, priority, vehicleType: vehicleType || undefined, deadline: deadline || undefined })
      navigate(`/track?shipment=${encodeURIComponent(shipmentId)}`)
    } catch (e) {
      console.error('Start tracking failed:', e)
      // Be specific: the three real causes are (a) session expired, (b) the
      // API server isn't reachable from THIS browser, (c) the server
      // rejected the payload — each needs a different fix by the user.
      let msg = 'Could not start tracking — check your connection and try again.'
      if (e instanceof ApiError) {
        if (e.status === 401) { msg = 'Your session expired — sign in again to start tracking.'; navigate(`/login?next=${encodeURIComponent('/plan-route')}`) }
        else if (e.status === 0) msg = `Cannot reach the SETU-NER API server (${API_ORIGIN || 'same origin'}). Start it with "cd server && npm run dev" and make sure this page is opened at http://localhost:5173.`
        else if (e.status === 400) msg = `The server rejected the route: ${e.message}. Re-run "Find Best Route" and select again.`
        else if (e.status >= 500) msg = `Server error while creating the shipment: ${e.message}. Check the API terminal — usually the database (run "npm run setup" in server/).`
        else msg = `${e.message} (HTTP ${e.status})`
      }
      showToast(msg, 'error')
    } finally {
      setTracking(false)
    }
  }

  const segRisks = useMemo(() => {
    const congestionCounts = computeCongestionCounts(vehicles)
    const m = new Map(SEGMENTS.map(s => [s.id, riskOf(s, weather, season, congestionCounts)]))
    return m
  }, [weather, season, vehicles, segmentsVersion])

  // disruption forecast: top risky corridors over next 24h
  const forecast = useMemo(() => {
    return SEGMENTS
      .map(s => ({ seg: s, r: segRisks.get(s.id)! }))
      .filter(x => x.r.total >= 48)
      .sort((a, b) => b.r.total - a.r.total)
      .slice(0, 6)
  }, [segRisks])

  const plannedRouteOnBlocked = useMemo(() => {
    // heuristic: does the "naive" shortest corridor contain a blocked seg?
    return SEGMENTS.some(s => {
      const r = segRisks.get(s.id)!
      return r.status === 'blocked' && (s.from === from || s.to === from || s.from === to || s.to === to)
    })
  }, [from, to, segRisks])

  return (
    <div className="grid min-h-full lg:grid-cols-[380px_1fr]">
      {/* form + results panel */}
      <div className="p-4 space-y-4 overflow-auto thin-scroll bg-canvas">
        <Card className="p-4">
          <SectionTitle icon={<RouteIcon size={18} />} title={isAlternativeSearch ? 'Find an Alternative Route' : t('plan.title')} sub={isAlternativeSearch ? (rerouteShipmentId ? `Rerouting ${rerouteShipmentId} while preserving shipment details` : 'Route preloaded from the reported disruption') : t('plan.sub')} />
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-500">{t('plan.origin')}</span>
              <select value={from} onChange={e => setFrom(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
                {towns.map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Weight (kg)</span>
              <input type="number" min="1" value={weightKg} onChange={e => setWeightKg(Math.max(1, Number(e.target.value)))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Priority</span>
              <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="standard">Standard</option><option value="priority">Priority</option><option value="urgent">Urgent</option>
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block"><span className="text-xs font-bold text-slate-500">Vehicle Type <span className="font-normal text-slate-400">(optional)</span></span><select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white"><option value="">Any suitable vehicle</option><option>Truck</option><option>Mini truck</option><option>Community carrier</option></select></label>
              <label className="block"><span className="text-xs font-bold text-slate-500">Delivery Deadline <span className="font-normal text-slate-400">(optional)</span></span><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white" /></label>
            </div>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">{t('plan.destination')}</span>
              <select value={to} onChange={e => setTo(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
                {towns.map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">{t('common.cargo')}</span>
              <select value={cargo} onChange={e => setCargo(e.target.value as CargoType)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
                {Object.entries(CARGO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {(cargo === 'medicine' || cargo === 'relief') && (
              <div className="text-[11px] bg-success-light text-success rounded-lg px-3 py-2 font-semibold">★ {t('plan.priorityNote')}</div>
            )}
            <Button onClick={plan} disabled={routeLoading} className="w-full"><RefreshCw size={15} className={routeLoading ? 'animate-spin' : ''} />{routeLoading ? 'Calculating…' : isAlternativeSearch ? 'Calculate Alternative Routes' : 'Find Best Route'}</Button>
          </div>
        </Card>

        {plannedRouteOnBlocked && (
          <Card className="p-3 border-l-4 !border-l-accent bg-accent-light/60">
            <div className="flex gap-2 text-[12px] font-semibold text-accent-text">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {t('plan.rerouteBanner')}
            </div>
          </Card>
        )}

        {routeError && (
          <Card className="p-3 border-l-4 !border-l-hazard bg-hazard-light/60">
            <div className="flex gap-2 text-[12px] font-semibold text-hazard">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {routeError}
            </div>
          </Card>
        )}

        {result && (
          <>
            {result.primary ? (
              <RouteCard r={result.primary} label="SAFE ROUTE" tone="primary" cargo={cargo} accessibility={routeAccessibility(result.primary)} selected={selectedMode === 'primary'} onSelect={() => { setSelectedMode('primary'); setUseWater(false) }} weather={weather} season={season} />
            ) : (
              <Card className="p-4 border-l-4 !border-l-hazard">
                <div className="flex gap-2 text-[12px] font-semibold text-hazard">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {t('plan.noRoute')}
                </div>
              </Card>
            )}
            {result.alternate && (
              // "Fast" only when the alternative genuinely is; a forced
              // detour around a blocked/affected corridor is labeled as such.
              <RouteCard r={result.alternate}
                label={result.alternate && result.primary && (result.alternate.timeHours <= result.primary.timeHours) ? 'FAST ROUTE' : 'ALTERNATE ROUTE'}
                tone="accent" cargo={cargo} accessibility={routeAccessibility(result.alternate)} selected={selectedMode === 'alternate'} onSelect={() => { setSelectedMode('alternate'); setUseWater(false) }} weather={weather} season={season} />
            )}
            {waterAlt && !result.primary?.segIds.some(id => { const sg = SEGMENTS.find(s => s.id === id); return sg ? isWaterway(sg) : false }) && !useWater && (
              <Card className={`p-4 border-l-4 !border-l-success bg-success-light/50 slide-in`}>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-success flex items-center gap-1.5"><Ship size={13} /> River alternative · underused NW-2 capacity</span>
                  <Pill tone="green">risk {waterAlt.waterwayRisk}/100</Pill>
                </div>
                <div className="text-[12px] text-slate-700 font-semibold">
                  {waterAlt.waterway.name.replace(/^NW-2 /, '')} — {waterRoute!.distanceKm} km · ~{waterRoute!.timeHours}h barge
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Waterway risk <strong>{waterAlt.waterwayRisk}</strong> vs road corridor risk <strong>{waterAlt.roadRisk}</strong>
                  {waterAlt.parallelRoad ? ` (${waterAlt.parallelRoad.name})` : ''}. Draft {waterAlt.waterway.draftM} m fits {CARGO_LABEL[cargo].toLowerCase()}. Time-flexible loads clear the roads for urgent convoys.
                </div>
                <Button variant={useWater ? 'secondary' : 'ghost'} onClick={() => { setUseWater(true); setSelectedMode('water') }} className="mt-3 w-full">
                  {useWater ? 'River route selected' : 'Plan via river (underused capacity)'} <Ship size={13} />
                </Button>
              </Card>
            )}
            {result.primary && !result.alternate && !waterAlt && (
              <Card className="p-3 border-l-4 !border-l-secondary bg-secondary-light/40">
                <div className="flex gap-2 text-[12px] font-semibold text-secondary">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" /> No alternative corridor under current conditions — this is the only viable route (every detour is &gt;3× longer). Re-check after weather or reports change.
                </div>
              </Card>
            )}
            {selectedRoute && <Card className="p-4 border-l-4 !border-l-success bg-success-light/40"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-slate-800">{isReroute ? 'Alternative route selected' : 'Route selected'}</div><div className="text-xs text-slate-600 mt-0.5">{isReroute ? 'Apply this route to the active shipment.' : 'Start tracking this shipment on the selected corridor.'}</div></div><Button variant="primary" onClick={beginTracking} disabled={tracking}>{tracking ? 'Starting…' : isReroute ? 'Apply New Route' : 'Start Tracking'} <ArrowRight size={14} /></Button></div></Card>}
          </>
        )}

        <Card className="p-4">
          <SectionTitle icon={<CloudRain size={18} />} title={t('plan.forecast')} />
          <div className="space-y-2">
            {forecast.map(({ seg, r }) => (
              <div key={seg.id} className="flex items-center gap-2 text-[12px]">
                <Gauge size={14} style={{ color: r.total >= 66 ? '#D64545' : '#E08E29' }} />
                <div className="flex-1">
                  <div className="font-semibold text-slate-700 leading-tight">{seg.name}</div>
                  <div className="text-[10px] text-slate-500">
                    risk {r.total}/100 · rain {r.rainMm}mm/h · {seg.failureHistory} past failures
                    {r.rainMm >= 18 ? ' · window: next 6–12 h' : ' · monitor'}
                  </div>
                </div>
                <Pill tone={r.total >= 66 ? 'red' : 'amber'}>{r.total >= 66 ? t('common.critical') : t('common.high')}</Pill>
              </div>
            ))}
            {!forecast.length && <div className="text-xs text-slate-400">No high-risk corridors in current conditions.</div>}
          </div>
        </Card>
      </div>

      {/* map */}
      <div className="relative min-h-[520px] lg:min-h-full">
        <MapView route={useWater ? waterRoute : result?.primary} altRoute={useWater ? result?.primary : result?.alternate} layers={{ roads: true, routes: true, riskZones: true, accessibility: true, weather: true, vehicles: false, facilities: false, alerts: false, waterway: useWater }} />
        <div className="absolute top-3 left-3 z-[500] bg-white/95 rounded-lg shadow-card px-3 py-2 text-[11px] font-semibold text-slate-600 space-y-1">
          <div className="flex items-center gap-2"><span className="w-5 h-1.5 rounded bg-primary inline-block" /> {t('plan.primary')}</div>
          <div className="flex items-center gap-2"><span className="w-5 h-1.5 rounded bg-accent inline-block" style={{ borderTop: '2px dashed #E08E29' }} /> {t('plan.alternate')}</div>
        </div>
      </div>
    </div>
  )
}

function RouteCard({ r, label, tone, cargo, accessibility, selected, onSelect, weather, season }: {
  r: RouteResult; label: string; tone: 'primary' | 'accent'; cargo: CargoType; accessibility: number
  selected: boolean; onSelect: () => void; weather: Record<string, WeatherPoint>; season: Season
}) {
  const { t } = useTranslation()
  const cw = convoyWindow(r.riskMax)
  const trend = useMemo(() => routeTrend(r.segIds, weather, season), [r.segIds, weather, season])
  const usesRiver = r.segIds.some(id => { const sg = SEGMENTS.find(s => s.id === id); return sg ? isWaterway(sg) : false })
  // Proactive reroute: corridor still open NOW, but the engine's forecast
  // crosses the configurable threshold within the next 24–48 h.
  const proactive = trend.read !== 'falling' && r.riskMax < 66 && trend.futurePeak >= REROUTE_LOOKAHEAD_RISK
  return (
    <Card className={`p-4 border-l-4 ${tone === 'primary' ? '!border-l-primary' : '!border-l-accent'} slide-in`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[11px] font-extrabold uppercase tracking-wide ${tone === 'primary' ? 'text-primary' : 'text-accent-text'}`}>{label}</span>
        <div className="flex items-center gap-1.5">
          {usesRiver && <Pill tone="green">🚢 river freight</Pill>}
          <Pill tone={r.riskMax >= 66 ? 'red' : r.riskMax >= 42 ? 'amber' : 'green'}>risk {r.riskMax}/100</Pill>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center mb-3 sm:grid-cols-4">
        <div><div className="text-lg font-extrabold tracking-tightest tabular-nums text-slate-800">{r.distanceKm}</div><div className="text-[10px] text-slate-500 font-semibold">km</div></div>
        <div><div className="text-lg font-extrabold tracking-tightest tabular-nums text-slate-800 flex items-center justify-center"><Clock size={15} className="mr-1" />{formatEta(r.timeHours)}</div><div className="text-[10px] text-slate-500 font-semibold">ETA</div></div>
        <div><div className="text-lg font-extrabold tracking-tightest tabular-nums text-hazard">{r.riskMax}/100</div><div className="text-[10px] text-slate-500 font-semibold">risk</div></div>
        <div><div className="text-lg font-extrabold tracking-tightest tabular-nums text-success">{accessibility}%</div><div className="text-[10px] text-slate-500 font-semibold">accessibility</div></div>
      </div>
      <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] font-semibold"><span className="text-slate-500">Route status</span><span className={r.blockedAhead.length ? 'text-accent-text' : 'text-success'}>{r.blockedAhead.length ? 'Caution corridor' : 'Open and accessible'}</span></div>
      {proactive && (
        <div className="text-[11px] bg-caution-light/70 text-accent-text rounded-lg px-2.5 py-2 mb-2 font-semibold flex gap-1.5 border border-caution/30">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>Risk forecast crosses <strong>{REROUTE_LOOKAHEAD_RISK}/100</strong> within 24–48 h (peak {trend.futurePeak}) while the corridor is still open — move time-flexible loads early or select the alternate below.</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1 mb-2">
        {r.segIds.map(id => <span key={id} className="text-[10px] bg-slate-100 rounded px-1.5 py-0.5 font-mono text-slate-600">{id}</span>)}
      </div>
      {r.blockedAhead.length > 0 && (
        <div className="text-[11px] bg-hazard-light text-hazard rounded-lg px-2.5 py-2 mb-2 font-semibold flex gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{r.blockedAhead.length} caution/affected stretch(es) on route — traffic controlled.</span>
        </div>
      )}
      {r.delayReason && (
        <div className="text-[11px] text-slate-500"><strong>{t('plan.delayReason')}:</strong> {r.delayReason}</div>
      )}
      {cw && cargo !== 'construction' && (
        <div className="mt-2 bg-secondary-light rounded-lg px-3 py-2 text-[11px] text-secondary">
          <div className="font-bold flex items-center gap-1.5"><Users size={13} /> {t('plan.convoyTitle')}</div>
          <div className="mt-0.5">{t('plan.convoyBody')} <span className="font-extrabold">{cw}</span></div>
        </div>
      )}
      {/* 48 h risk history + 48 h forecast (weather-driven disruption) */}
      {trend.segIds.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-white px-2.5 pt-2 pb-1.5">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">48h weather-risk trend</span>
            <span className="text-[10px] text-slate-400 font-semibold">dashed = forecast</span>
          </div>
          <RiskTrendChart stats={trend} height={92} />
        </div>
      )}
      <Button variant={selected ? 'secondary' : 'ghost'} onClick={onSelect} className="mt-3 w-full">{selected ? 'Selected' : 'Select'} <ArrowRight size={13} /></Button>
      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1"><ArrowRight size={10} /> Cargo: {CARGO_LABEL[cargo]} · hybrid engine: terrain + rain + failure-history rules, blended with a learned failure-probability model</div>
    </Card>
  )
}

function formatEta(hours: number) {
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  return `${whole}h ${minutes}m`
}
