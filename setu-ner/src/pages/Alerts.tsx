import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, MapPin, Clock, Wrench, CloudRain, CheckCircle2, Route as RouteIcon, Truck, Landmark, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import MapView from '../components/MapView'
import { Card, SectionTitle, Pill, statusPill, RowSkeleton, CardSkeleton, EmptyState } from '../components/ui'
import { useStore } from '../store/useStore'
import { SEGMENTS } from '../data/ner'
import { riskOf } from '../lib/risk'
import { timeAgo } from '../lib/format'
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, YAxis } from 'recharts'

interface GovtAlert {
  id: string; source: string; event: string; headline: string; description: string
  severity: 'high' | 'medium' | 'low'; areaDesc: string; issuedAt: string; expiresAt: string | null; link: string | null; live: boolean
}
interface GovtFeed {
  alerts: GovtAlert[]; live: boolean; fetchedAt: number; source: string
  status?: { lastError: string | null; lastAttemptAt: number | null; nextPollAt: number | null }
}

export default function Alerts() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [govt, setGovt] = useState<GovtFeed | null>(null)
  const [retrying, setRetrying] = useState(false)
  const { alerts, weather, season, vehicles, resolveAlert, initialLoad, segmentsVersion, user } = useStore()
  // Dismissing a live public alert is a control-room action — mirrors the
  // requireRole('official', 'admin') check the server now enforces on
  // PATCH /api/alerts/:id/resolve, so the button never promises something
  // the API will 403 on.
  const canResolve = user?.role === 'official' || user?.role === 'admin'
  useEffect(() => {
    let cancelled = false
    const load = () => api.get<GovtFeed>('/api/govt/alerts').then(d => { if (!cancelled) setGovt(d) }).catch(() => {})
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  const retryGovt = async () => {
    setRetrying(true)
    try {
      const d = await api.post<GovtFeed>('/api/govt/alerts/refresh')
      setGovt(d)
      showToast(d.live ? `Live SACHET feed: ${d.alerts.length} active alert(s) for NER.` : `SACHET still unreachable${d.status?.lastError ? ` (${d.status.lastError})` : ''} — showing offline copy.`, d.live ? 'success' : 'info')
    } catch { showToast('Could not refresh the official feed.', 'error') }
    finally { setRetrying(false) }
  }
  const [params] = useSearchParams()
  const [filter, setFilter] = useState('all')
  const [focus, setFocus] = useState<[number, number] | null>(null)
  const [openedAlert, setOpenedAlert] = useState<string | null>(params.get('alert'))

  const activeAlerts = alerts.filter(alert => !alert.resolved)
  const list = activeAlerts.filter(a => filter === 'all' || a.severity === filter)

  useEffect(() => {
    const alert = params.get('alert') ? alerts.find(item => item.id === params.get('alert')) : undefined
    if (alert) {
      setOpenedAlert(alert.id)
      if (alert.lat && alert.lng) setFocus([alert.lat, alert.lng])
    }
  }, [alerts, params])

  const forecast = useMemo(() => {
    return SEGMENTS.map(s => ({ seg: s, r: riskOf(s, weather, season) }))
      .filter(x => x.r.total >= 50)
      .sort((a, b) => b.r.total - a.r.total).slice(0, 5)
  }, [weather, season, segmentsVersion])

  const worst = forecast[0]
  const chartData = worst ? worst.r.trend.map((v, i) => ({ t: `${-48 + i * 2}h`, risk: v })) : []
  const selectedAlert = alerts.find(alert => alert.id === openedAlert)
  const affectedSegment = selectedAlert?.segmentId ? SEGMENTS.find(segment => segment.id === selectedAlert.segmentId) : undefined
  const affectedShipments = selectedAlert?.segmentId ? vehicles.filter(vehicle => vehicle.path.includes(selectedAlert.segmentId!)) : []
  const alertLocation: [number, number] | null = selectedAlert?.lat && selectedAlert.lng ? [selectedAlert.lat, selectedAlert.lng] : focus
  const severityLabel = (severity: string) => severity === 'high' ? 'CRITICAL' : severity === 'medium' ? 'WARNING' : 'INFO'
  const routeLink = selectedAlert && affectedShipments[0]
    ? `/plan-route?shipment=${encodeURIComponent(affectedShipments[0].id)}&reroute=1`
    : `/plan-route?from=${encodeURIComponent(affectedSegment?.from ?? '')}&to=${encodeURIComponent(affectedSegment?.to ?? '')}&cargo=medicine&exclude=${encodeURIComponent(selectedAlert?.segmentId ?? '')}&report=${encodeURIComponent(selectedAlert?.id ?? '')}`

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle icon={<AlertTriangle size={18} />} title={t('alerts.title')} sub={t('alerts.sub')}
              right={<div className="flex gap-1 rounded-xl bg-slate-100 p-1">{[['all', 'All'], ['high', 'Critical'], ['medium', 'Warning'], ['low', 'Info']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${filter === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}</div>} />
            <div className="space-y-2 max-h-[520px] overflow-auto thin-scroll pr-1">
              {initialLoad ? (
                <><RowSkeleton lines={3} /><RowSkeleton lines={3} /><RowSkeleton lines={3} /></>
              ) : list.length ? (
                list.map(a => (
                  <Card key={a.id} className={`p-3 border-l-4 cursor-pointer ${openedAlert === a.id ? 'ring-2 ring-primary' : ''} ${a.severity === 'high' ? '!border-l-hazard' : a.severity === 'medium' ? '!border-l-caution' : '!border-l-secondary'}`} >
                    <button className="w-full text-left" onClick={() => { setOpenedAlert(a.id); if (a.lat && a.lng) setFocus([a.lat, a.lng]) }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Pill tone={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'amber' : 'blue'}>{severityLabel(a.severity)}</Pill>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1"><Clock size={10} />{timeAgo(a.time)}</span>
                        </div>
                        {a.read === false && <span className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                      <div className="font-bold text-[13px] text-slate-800 mt-1.5">{a.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-start gap-1">
                        <MapPin size={11} className="mt-0.5 shrink-0" /> {a.location}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">{a.message}</div>
                      <div className="text-[11px] mt-1.5 bg-secondary-light rounded px-2 py-1 text-secondary flex items-start gap-1">
                        <Wrench size={11} className="mt-0.5 shrink-0" /> <span><strong>{t('alerts.suggestedAction')}:</strong> {a.action}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><RouteIcon size={11} /> {a.segmentId ?? 'Affected route pending'}</span><span className="flex items-center gap-1"><Truck size={11} /> {a.segmentId ? vehicles.filter(vehicle => vehicle.path.includes(a.segmentId!)).length : 0} shipments affected</span></div>
                    </button>
                  </Card>
                ))
              ) : (
                <EmptyState icon={<AlertTriangle size={18} />} title="No active alerts right now" body={filter === 'all' ? 'The network is clear — nothing needs your attention.' : 'No alerts at this severity level. Try a different filter.'} />
              )}
            </div>
          </Card>
          {selectedAlert && (
            <Card className="p-4 border-l-4 !border-l-primary">
              <div className="flex items-center justify-between gap-3"><SectionTitle icon={<AlertTriangle size={16} />} title="Alert Details" /><Pill tone={selectedAlert.severity === 'high' ? 'red' : selectedAlert.severity === 'medium' ? 'amber' : 'blue'}>{severityLabel(selectedAlert.severity)}</Pill></div>
              <div className="grid gap-3 text-xs sm:grid-cols-2"><Detail label="Incident" value={selectedAlert.title} /><Detail label="Location" value={selectedAlert.location} /><Detail label="Severity" value={severityLabel(selectedAlert.severity)} /><Detail label="Affected Route" value={affectedSegment?.name ?? selectedAlert.segmentId ?? 'Regional alert'} /><Detail label="Affected Shipments" value={`${affectedShipments.length}`} /></div>
              <div className="mt-3 rounded-lg bg-secondary-light p-3 text-xs text-secondary"><strong>Recommended Action:</strong> {selectedAlert.action}</div>
              <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => selectedAlert.lat && selectedAlert.lng && setFocus([selectedAlert.lat, selectedAlert.lng])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">View on Map</button><Link to={routeLink} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-dark">Find Alternative Route</Link>{canResolve && <button onClick={() => { resolveAlert(selectedAlert.id); setOpenedAlert(null); setFocus(null) }} className="inline-flex items-center gap-1 rounded-lg bg-success px-3 py-2 text-xs font-bold text-white hover:brightness-95"><CheckCircle2 size={13} /> Mark Resolved</button>}</div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="h-[300px]">
              <MapView layers={{ roads: true, alerts: true, incidents: true, reports: true, facilities: false }} focus={alertLocation} focusZoom={alertLocation ? 10 : undefined} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start justify-between gap-2">
              <SectionTitle icon={<Landmark size={18} />} title="Official government alerts" sub="NDMA SACHET (IMD · CWC · State DMAs) — Common Alerting Protocol feed for the North-East" />
              <div className="flex items-center gap-1.5 shrink-0">
                {govt && <Pill tone={govt.live ? 'green' : 'amber'}>{govt.live ? 'LIVE feed' : 'Offline copy'}</Pill>}
                {user && <button onClick={retryGovt} disabled={retrying} title="Re-poll sachet.ndma.gov.in now" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-primary disabled:opacity-50"><RefreshCw size={13} className={retrying ? 'animate-spin' : ''} /></button>}
              </div>
            </div>
            {!govt ? <RowSkeleton lines={3} /> : govt.alerts.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={22} />} title="No active official warnings for NER" body="The SACHET feed currently has no IMD/CWC/SDMA alerts naming a North-East district." />
            ) : (
              <div className="space-y-2">
                {govt.alerts.slice(0, 8).map(g => (
                  <div key={g.id} className="rounded-lg border border-border bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{g.source} · {g.event}</div>
                      <Pill tone={g.severity === 'high' ? 'red' : g.severity === 'medium' ? 'amber' : 'blue'}>{severityLabel(g.severity)}</Pill>
                    </div>
                    <div className="text-sm font-semibold mt-0.5">{g.headline}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span className="inline-flex items-center gap-1"><MapPin size={11} /> {g.areaDesc}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={11} /> issued {timeAgo(new Date(g.issuedAt).getTime())}</span>
                      {g.link && <a className="underline" href={g.link} target="_blank" rel="noreferrer">source ↗</a>}
                    </div>
                  </div>
                ))}
                {!govt.live && <div className="text-[11px] text-slate-500">sachet.ndma.gov.in was unreachable from the API server{govt.status?.lastError ? ` (${govt.status.lastError})` : ''} — showing a bundled sample so the workflow stays demonstrable. It re-polls every few minutes and switches to live data automatically; use ↻ to retry now. No sign-up or key is needed — only outbound internet from the server.</div>}
                {govt.live && <div className="text-[11px] text-slate-500">Polled from sachet.ndma.gov.in {timeAgo(govt.fetchedAt)} · CAP RSS (IMD · CWC · SDMAs) filtered to North-East states and mapped onto SETU-NER districts.</div>}
              </div>
            )}
          </Card>

          {initialLoad ? <CardSkeleton lines={5} /> : (
            <Card className="p-4">
              <SectionTitle icon={<CloudRain size={18} />} title={t('alerts.forecastTitle')} />
              {forecast.length ? (
                <div className="space-y-2">
                  {forecast.map(({ seg, r }) => (
                    <div key={seg.id} className="flex items-center gap-2 text-[12px]">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${r.total >= 66 ? 'bg-hazard' : 'bg-caution'}`} />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-700">{seg.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.total >= 66 ? 'Likely closure window 6–18 h' : 'Watch — rising risk'}; rain peak {r.rainMm}mm/h; {seg.failureHistory} past failures
                        </div>
                      </div>
                      {statusPill(r.status)}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<CloudRain size={18} />} title="No elevated-risk corridors forecast" body="Conditions across the network are calm for the next 48 hours." />
              )}
              {worst && (
                <div className="mt-4">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">
                    {t('dashboard.riskTrend')} — {worst.seg.name}
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="t" fontSize={9} interval={5} />
                      <YAxis domain={[0, 100]} fontSize={9} />
                      <Tooltip />
                      <Line type="monotone" dataKey="risk" stroke="#D64545" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="font-semibold text-slate-700">{value}</div></div>
}
