import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CloudRain, ExternalLink, Eye, Gauge, Navigation, Route as RouteIcon, ShieldAlert, Truck, WifiOff } from 'lucide-react'
import MapView from '../components/MapView'
import { Card } from '../components/ui'
import { useStore } from '../store/useStore'
import { canAccess } from '../lib/rbac'
import { SEGMENTS } from '../data/ner'
import { accessibilityScore, riskOf, elevatedWeatherRiskSegments } from '../lib/risk'
import { timeAgo } from '../lib/format'
import type { AlertItem, Vehicle } from '../types'

type ActivityItem = {
  id: string
  kind: 'critical' | 'alert' | 'route' | 'weather' | 'shipment'
  title: string
  detail: string
  meta: string
  route: string
  focus?: [number, number]
}

export default function Home() {
  const { weather, season, vehicles, alerts, online, lastSync, segmentsVersion, user } = useStore()
  const role = user?.role ?? null
  const [layers, setLayers] = useState({ roads: true, alerts: true, vehicles: true })
  const [focus, setFocus] = useState<[number, number] | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => {
    let open = 0
    let blocked = 0
    let caution = 0
    let accessibilityTotal = 0
    for (const segment of SEGMENTS) {
      const risk = riskOf(segment, weather, season)
      if (risk.status === 'open') open++
      else if (risk.status === 'blocked') blocked++
      else caution++
      accessibilityTotal += accessibilityScore(segment, weather, season)
    }
    return { open, blocked, caution, accessibility: Math.round(accessibilityTotal / SEGMENTS.length) }
  }, [weather, season, segmentsVersion])

  const elevated = useMemo(() => elevatedWeatherRiskSegments(weather, season), [weather, season])

  const metrics = [
    { label: 'Active Shipments', value: vehicles.filter(vehicle => vehicle.status !== 'delivered').length, sub: `${vehicles.length} tracked vehicles`, icon: Truck, tone: 'indigo' },
    { label: 'Active Alerts', value: alerts.filter(alert => !alert.resolved).length, sub: `${alerts.filter(alert => !alert.resolved && alert.severity === 'high').length} high priority`, icon: ShieldAlert, tone: 'red' },
    { label: 'Blocked Routes', value: stats.blocked, sub: `${stats.caution} routes need caution`, icon: RouteIcon, tone: 'amber' },
    { label: 'Route Accessibility', value: `${stats.accessibility}%`, sub: `${stats.open} of ${SEGMENTS.length} routes open`, icon: Gauge, tone: 'teal' },
  ] as const

  const activity = useMemo(() => {
    const alertItems = alerts.filter(alert => !alert.resolved).slice(0, 6).map(alertToActivity)
    const disruptionItems: ActivityItem[] = SEGMENTS
      .map(segment => ({ segment, risk: riskOf(segment, weather, season) }))
      .filter(({ risk }) => risk.status !== 'open')
      .sort((a, b) => b.risk.total - a.risk.total)
      .slice(0, 4)
      .map(({ segment, risk }) => ({
        id: `route-${segment.id}`,
        kind: 'route',
        title: risk.status === 'blocked' ? 'Route blocked' : 'Route disruption detected',
        detail: segment.name,
        meta: `${risk.total}/100 risk · ${segment.reportReason ?? 'Monitor conditions before departure'}`,
        route: '/plan-route',
        focus: segment.coords[Math.floor(segment.coords.length / 2)],
      }))
    const shipmentItems = vehicles
      .filter(vehicle => vehicle.status === 'delayed' || vehicle.status === 'halted')
      .slice(0, 3)
      .map(vehicleToActivity)
    return [...alertItems, ...disruptionItems, ...shipmentItems].slice(0, 8)
  }, [alerts, vehicles, weather, season, segmentsVersion])

  const showOnMap = (item: ActivityItem) => {
    if (!item.focus) return
    setFocus(item.focus)
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <section className="contour-field relative overflow-hidden rounded-2xl bg-hero-gradient px-6 py-12 text-white shadow-panel sm:px-10 sm:py-16">
        <div className="relative max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/80"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Live Northeast network</div>
          <h1 className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tightest sm:text-[3.4rem]">Connecting communities. Delivering hope.</h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">Smarter routes, safer journeys, a stronger Northeast — one shared map of road risk, shipments, and relief.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {canAccess(role, '/plan-route') && <Link to="/plan-route" className="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition hover:brightness-95"><RouteIcon size={16} className="mr-2" />Plan a Route</Link>}
            <Link to="/track" className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"><Navigation size={16} className="mr-2" />Track Shipment</Link>
            {canAccess(role, '/report')
              ? <Link to="/report" className="inline-flex items-center rounded-lg border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"><AlertTriangle size={16} className="mr-2" />Report Incident</Link>
              : <Link to="/login" className="inline-flex items-center rounded-lg border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"><AlertTriangle size={16} className="mr-2" />Sign in to report</Link>}
            {canAccess(role, '/dashboard') && <Link to="/dashboard" className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">Command Dashboard</Link>}
            {canAccess(role, '/driver') && <Link to="/driver" className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">My Drive</Link>}
            {canAccess(role, '/company') && <Link to="/company" className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">Company Console</Link>}
          </div>
          {!online && <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-amber-200"><WifiOff size={14} /> Offline mode active{lastSync && ` · synced ${timeAgo(lastSync)}`}</div>}
          {elevated > 0 && (
            <Link to={canAccess(role, '/plan-route') ? '/plan-route' : '/track'} className="mt-5 flex max-w-lg items-center gap-2.5 rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20">
              <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-300" />
              {elevated} route{elevated > 1 ? 's' : ''} currently at elevated weather risk — see them on the map <ArrowRight size={13} className="ml-auto shrink-0" />
            </Link>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="route-rule text-2xl font-extrabold tracking-tight text-main">A clearer view of movement and risk</h2></div><span className="hidden items-center gap-1.5 text-xs font-semibold text-slate-500 sm:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Updating live</span></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, sub, icon: Icon, tone }) => (
            <Card key={label} className="p-4 transition hover:-translate-y-0.5 hover:shadow-panel"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone === 'red' ? 'bg-hazard-light text-hazard' : tone === 'amber' ? 'bg-accent-light text-accent-text' : tone === 'teal' ? 'bg-secondary-light text-secondary' : 'bg-primary-light text-primary'}`}><Icon size={19} /></div><span className="text-[10px] font-bold text-slate-400">Live</span></div><div className="mt-5 text-[32px] font-extrabold tracking-tightest text-main tabular-nums">{value}</div><div className="mt-1 text-sm font-bold text-slate-700">{label}</div><div className="mt-1 text-xs text-slate-500">{sub}</div></Card>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div><div className="mb-4"><h2 className="route-rule text-2xl font-extrabold tracking-tight text-main">What&apos;s happening now?</h2></div><div className="space-y-3">{activity.map(item => <ActivityRow key={item.id} item={item} onMap={() => showOnMap(item)} />)}{!activity.length && <Card className="p-6 text-sm text-slate-500">No active disruptions are being reported right now.</Card>}</div></div>
        <div ref={mapRef} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card h-full"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-panel-gradient px-4 py-3"><div><div className="flex items-center gap-2 text-sm font-bold text-main"><CloudRain size={16} className="text-primary" /> Northeast network</div><div className="mt-0.5 text-[11px] text-slate-500">Road risk, alerts, and active shipments</div></div><div className="flex gap-1.5 text-[11px] font-semibold">{[{ k: 'roads', label: 'Roads' }, { k: 'vehicles', label: 'Shipments' }, { k: 'alerts', label: 'Alerts' }].map(layer => <button key={layer.k} onClick={() => setLayers(state => ({ ...state, [layer.k]: !state[layer.k as keyof typeof state] }))} className={`rounded-full px-2.5 py-1 transition ${layers[layer.k as keyof typeof layers] ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>{layer.label}</button>)}</div></div><div className="min-h-[360px] flex-1"><MapView layers={layers} focus={focus} focusZoom={focus ? 10 : undefined} /></div></div>
      </section>

      <section><div className="mb-4"><h2 className="route-rule text-2xl font-extrabold tracking-tight text-main">Quick actions</h2></div><div className="grid gap-3 sm:grid-cols-3">{[{ to: '/plan-route', icon: RouteIcon, title: 'Plan Route', body: 'Find the safest path through changing conditions.' }, { to: '/track', icon: Navigation, title: 'Track Shipment', body: 'Follow active vehicles across the region.' }, { to: '/report', icon: AlertTriangle, title: 'Report Incident', body: 'Share a field signal with the network.' }].map(({ to, icon: Icon, title, body }) => <Link key={to} to={to} className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-panel"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary"><Icon size={18} /></span><ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-primary" /></div><h3 className="mt-4 font-bold text-main">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p></Link>)}</div></section>
    </div>
  )
}

function ActivityRow({ item, onMap }: { item: ActivityItem; onMap: () => void }) {
  const user = useStore(s => s.user)
  const color = item.kind === 'critical' ? 'bg-hazard' : item.kind === 'weather' ? 'bg-accent' : item.kind === 'shipment' ? 'bg-secondary' : 'bg-primary'
  // Never link a signed-in role to a page it can't open — swap to Track.
  const target = canAccess(user?.role ?? null, item.route) ? item.route : '/track'
  return <Card className="group p-3 transition hover:-translate-y-0.5 hover:shadow-panel"><div className="flex gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} /><div className="min-w-0 flex-1"><Link to={target} className="block"><div className="flex items-start justify-between gap-3"><div className="text-sm font-bold text-main group-hover:text-primary">{item.title}</div><ExternalLink size={14} className="shrink-0 text-slate-300 group-hover:text-primary" /></div><div className="mt-1 text-xs font-semibold text-slate-600">{item.detail}</div><div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.meta}</div></Link><button onClick={onMap} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Eye size={13} /> View on Map</button></div></div></Card>
}

function alertToActivity(alert: AlertItem): ActivityItem {
  return { id: alert.id, kind: alert.severity === 'high' ? 'critical' : alert.type === 'weather' ? 'weather' : 'alert', title: alert.title, detail: alert.location, meta: `${alert.message} · ${alert.action}`, route: '/alerts', focus: alert.lat && alert.lng ? [alert.lat, alert.lng] : undefined }
}

function vehicleToActivity(vehicle: Vehicle): ActivityItem {
  return { id: vehicle.id, kind: 'shipment', title: vehicle.status === 'halted' ? 'Shipment halted' : 'Shipment delayed', detail: `${vehicle.id} · ${vehicle.from} to ${vehicle.to}`, meta: `${vehicle.cargoDetail} · ${vehicle.delayHours}h delay`, route: '/track', focus: [vehicle.lat, vehicle.lng] }
}
