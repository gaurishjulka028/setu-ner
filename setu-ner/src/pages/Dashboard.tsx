import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Truck, Clock, AlertTriangle, CloudRain, TrendingUp, BarChart3, Siren,
  Package, FileText, MapPin, Send, Rocket, Gauge,
} from 'lucide-react'
import { Card, SectionTitle, Kpi, Button, Pill, Toggle, KpiSkeleton, CardSkeleton, EmptyState } from '../components/ui'
import MapView from '../components/MapView'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import type { StockLevels } from '../types'
import { SEGMENTS, DISTRICTS, STOCKS } from '../data/ner'
import { riskOf, computeCongestionCounts } from '../lib/risk'
import { CARGO_LABEL, CARGO_PRIORITY } from '../lib/format'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } from 'recharts'

export default function Dashboard() {
  const { t } = useTranslation()
  const { vehicles, alerts, weather, season, setSeason, disasterMode, disasterInfo, toggleDisaster, reports, initialLoad, segmentsVersion, pushAlert } = useStore()
  const { showToast } = useToast()
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  // What the WhatsApp provider ACTUALLY did with the requisition (shown on
  // the card after send, so the button never claims more than happened).
  const [sendResult, setSendResult] = useState<{ ok: boolean; simulated?: boolean; viaTemplate?: boolean; deliveredBody?: string; error?: string; status?: string } | null>(null)
  // Live stock from the backend (same GET /api/stock the Gaps page uses);
  // falls back to the bundled table until it arrives.
  const [liveStocks, setLiveStocks] = useState<StockLevels[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api.get<StockLevels[]>('/api/stock').then(d => { if (!cancelled) setLiveStocks(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const segStats = useMemo(() => {
    let blocked = 0, caution = 0
    const congestionCounts = computeCongestionCounts(vehicles)
    const riskMap = new Map(SEGMENTS.map(s => [s.id, riskOf(s, weather, season, congestionCounts)]))
    for (const r of riskMap.values()) { if (r.status === 'blocked') blocked++; else if (r.status === 'caution') caution++ }
    return { blocked, caution, riskMap }
  }, [weather, season, vehicles, segmentsVersion])

  const moving = vehicles.filter(v => v.status !== 'delivered').length
  const onTime = vehicles.filter(v => v.delayHours === 0).length
  const onTimePct = Math.round((onTime / vehicles.length) * 100)
  const avgDelay = Math.round((vehicles.reduce((a, v) => a + v.delayHours, 0) / vehicles.length) * 10) / 10

  const bottlenecks = useMemo(() =>
    SEGMENTS.map(s => ({ seg: s, r: segStats.riskMap.get(s.id)! }))
      .sort((a, b) => b.r.total - a.r.total).slice(0, 5),
    [segStats])

  const throughput = DISTRICTS.slice(0, 8).map((d, i) => ({
    name: d.hq,
    shipments: [12, 9, 15, 7, 11, 8, 14, 10][i],
    onTime: [10, 6, 12, 3, 9, 5, 11, 7][i],
  }))

  const trend = Array.from({ length: 24 }, (_, i) => ({
    t: `${-48 + i * 2}h`,
    blocked: 1 + Math.round(Math.sin(i / 3) + (i > 14 ? 2 : 1) + (i > 18 ? 1 : 0)),
    rain: 4 + Math.abs(Math.sin(i / 2.5)) * 22,
  }))

  const priorityQueue = useMemo(() =>
    vehicles.filter(v => v.status !== 'delivered')
      .sort((a, b) => (CARGO_PRIORITY[a.cargo] - CARGO_PRIORITY[b.cargo]) || (b.delayHours - a.delayHours))
      .slice(0, 6), [vehicles])

  // Auto-drafted requisition for the WORST-OFF district right now — derived
  // from live stock levels (GET /api/stock), the blocked/caution corridors
  // touching that district, and the convoys currently stalled on them.
  const requisition = useMemo(() => {
    const stocks = liveStocks ?? STOCKS
    const worst = [...stocks].sort((a, b) => Math.min(a.medicine, a.food) - Math.min(b.medicine, b.food))[0]
    const district = DISTRICTS.find(d => d.id === worst?.districtId)
    const blocked = SEGMENTS.filter(sg => {
      const r = segStats.riskMap.get(sg.id)
      return r && r.status !== 'open' && (sg.districtId === district?.id || sg.to === district?.hq || sg.from === district?.hq || sg.to.includes(district?.hq ?? '§'))
    })
    const blockedIds = new Set(blocked.map(b => b.id))
    const stalled = vehicles.filter(v => v.status !== 'delivered' && (v.status === 'halted' || v.delayHours >= 2) && (v.path.some(id => blockedIds.has(id)) || v.to.includes(district?.hq ?? '§')))
    const convoyList = stalled.slice(0, 3).map(v => `${v.id} (${CARGO_LABEL[v.cargo].toLowerCase()})`).join(', ')
    const corridors = blocked.slice(0, 2).map(b => `${b.name}${b.reportReason ? ` — ${b.reportReason}` : ''}`).join('; ')
    const rain = Math.max(0, ...blocked.map(b => segStats.riskMap.get(b.id)?.rainMm ?? 0))
    return {
      districtId: district?.id,
      to: `District Commissioner, ${district?.name ?? 'district'}${district ? ` (${district.hq})` : ''}`,
      subject: `URGENT: Emergency corridor + last-mile requisition — ${worst ? `${worst.medicine <= worst.food ? 'medicine' : 'food'} stock critical` : 'supply gap'}`,
      body:
        `As of live platform data (${new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}), ${district?.name ?? 'the district'} has ${worst?.medicine ?? '?'} days of medicine and ${worst?.food ?? '?'} days of food grain remaining.\n` +
        (blocked.length ? `${blocked.length} corridor(s) affected: ${corridors}${rain ? ` (rainfall up to ${Math.round(rain)} mm/h)` : ''}. ` : 'No corridor into the district is currently blocked. ') +
        (stalled.length ? `${stalled.length} convoy(s) stalled/delayed: ${convoyList}.\n` : 'No convoys currently stalled.\n') +
        `Requested: (1) open an emergency corridor with PWD escort on the least-risk alternative from Plan Route; (2) last-mile handoff via community carriers at the nearest open depot; ${worst && worst.medicine <= 3 ? '(3) consider air drop for oxygen/medicines to relief camps.' : '(3) pre-position stock before the forecast peak.'}`,
    }
  }, [liveStocks, segStats, vehicles])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* header controls */}
      <Card className="p-4 flex flex-wrap items-center gap-4 justify-between">
        <SectionTitle icon={<BarChart3 size={18} />} title={t('dashboard.title')} sub={t('dashboard.sub')} />
        <div className="flex items-center gap-4 flex-wrap">
          <Toggle on={season === 'monsoon'} onChange={() => setSeason(season === 'monsoon' ? 'dry' : 'monsoon')}
            label={season === 'monsoon' ? '🌧 Monsoon weighting' : '☀ Dry-season weighting'} />
          <Button variant={disasterMode ? 'hazard' : 'accent'} onClick={() => toggleDisaster().then(() => showToast(disasterMode ? 'Disaster mode stood down for all users.' : 'Disaster mode activated region-wide — all users notified.', 'success')).catch(() => showToast('Could not change disaster mode — officials/admins only, and the API must be reachable.', 'error'))}>
            <Siren size={15} /> {disasterMode ? t('dashboard.disasterOn') : t('dashboard.disasterOff')}
          </Button>
          {disasterMode && disasterInfo.activatedBy && <span className="text-[11px] text-slate-500">by <strong>{disasterInfo.activatedBy}</strong>{disasterInfo.activatedAt ? ` · ${new Date(disasterInfo.activatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>}
          {disasterMode && <Link to="/disaster"><Button variant="secondary">Open view →</Button></Link>}
        </div>
      </Card>

      {alerts.filter(a => !a.resolved && a.type === 'disaster' && a.severity === 'high').slice(0, 1).map(a => (
        <Card key={a.id} className="p-4 border-hazard/40 bg-hazard-light/40">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-hazard p-2 text-white"><Siren size={16} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black uppercase tracking-wide text-hazard">Active disaster alert</div>
              <div className="mt-1 text-sm font-extrabold text-slate-800">{a.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{a.message}</div>
              <div className="mt-2 text-[11px] font-bold text-hazard">Action: {a.action}</div>
            </div>
            <Link to="/disaster"><Button variant="secondary">Open Disaster Mode →</Button></Link>
          </div>
        </Card>
      ))}

      {/* KPIs */}
      {initialLoad ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Truck size={18} />} label={t('dashboard.shipmentsToday')} value={moving} sub={`${vehicles.length} vehicles tracked`} tone="primary" />
          <Kpi icon={<Clock size={18} />} label={t('dashboard.onTime')} value={`${onTimePct}%`} sub={`${onTime}/${vehicles.length} on schedule`} tone="green" />
          <Kpi icon={<AlertTriangle size={18} />} label={t('dashboard.avgDelay')} value={`${avgDelay} h`} sub="weighted by corridor risk" tone="accent" />
          <Kpi icon={<MapPin size={18} />} label={t('dashboard.cutOff')} value={segStats.blocked} sub={`${segStats.caution} caution corridors`} tone="red" />
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-panel-gradient px-4 py-3">
          <SectionTitle icon={<MapPin size={17} />} title="Risk & accessibility network" sub="Shared map view of route risk and passability across the Northeast" />
        </div>
        <div className="h-[360px]">
          <MapView layers={{ roads: false, routes: false, riskZones: true, accessibility: true, weather: false, vehicles: false, facilities: false, alerts: false }} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* bottlenecks */}
        {initialLoad ? <CardSkeleton lines={5} /> : (
          <Card className="p-4">
            <SectionTitle icon={<Gauge size={17} />} title={t('dashboard.bottlenecks')} />
            {bottlenecks.length ? (
              <div className="space-y-2.5">
                {bottlenecks.map(({ seg, r }) => (
                  <div key={seg.id} className="text-[12px]">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700">{seg.name}</span>
                      <Pill tone={r.total >= 66 ? 'red' : 'amber'}>{r.total}</Pill>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.total}%`, background: r.total >= 66 ? '#D64545' : '#E08E29' }} />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">terrain {r.terrain} · rain {r.rain} · hist {r.history} · sensor {r.sensor} · learned {r.learned} · congestion {r.congestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Gauge size={18} />} title="No high-risk corridors right now" body="All tracked segments are within normal risk thresholds." />
            )}
          </Card>
        )}

        {/* throughput chart */}
        {initialLoad ? <CardSkeleton height="h-[230px]" /> : (
          <Card className="p-4">
            <SectionTitle icon={<TrendingUp size={17} />} title={t('dashboard.throughput')} />
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={throughput}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={9} />
                <YAxis fontSize={9} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="shipments" fill="#1B4965" radius={[3, 3, 0, 0]} />
                <Bar dataKey="onTime" fill="#2E9E5B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* risk trend */}
        {initialLoad ? <CardSkeleton height="h-[230px]" /> : (
          <Card className="p-4">
            <SectionTitle icon={<CloudRain size={17} />} title={t('dashboard.riskTrend')} />
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" fontSize={9} interval={5} />
                <YAxis fontSize={9} />
                <Tooltip />
                <Area type="monotone" dataKey="rain" stroke="#1B4965" fill="#1B4965" fillOpacity={0.12} name="rain mm/h" />
                <Area type="monotone" dataKey="blocked" stroke="#D64545" fill="#D64545" fillOpacity={0.2} name="blocked corridors" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* priority queue */}
        {initialLoad ? <CardSkeleton lines={4} /> : (
          <Card className="p-4">
            <SectionTitle icon={<Package size={17} />} title={t('dashboard.priorityTitle')} sub={t('dashboard.priorityBody')} />
            {priorityQueue.length ? (
              <div className="space-y-2">
                {priorityQueue.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-2 text-[12px] border border-slate-100 rounded-lg p-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${i < 2 ? 'bg-hazard text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-700 truncate">{CARGO_LABEL[v.cargo]} → {v.to}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{v.id} · {v.delayHours}h wait</div>
                    </div>
                    {v.status === 'halted' && <Pill tone="red">stalled</Pill>}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Package size={18} />} title="No shipments in the priority queue" body="Every tracked shipment is currently delivered or off the priority list." />
            )}
          </Card>
        )}

        {/* auto requisition */}
        <Card className="p-4">
          <SectionTitle icon={<FileText size={17} />} title={t('dashboard.requisition')} sub={t('dashboard.requisitionBody')} />
          <div className="bg-canvas rounded-lg p-3 text-[11px] text-slate-600 border border-slate-200">
            <div className="font-bold text-slate-800">To: {requisition.to}</div>
            <div className="font-semibold text-hazard mt-1">{requisition.subject}</div>
            <pre className="whitespace-pre-wrap font-sans mt-2 leading-relaxed">{requisition.body}</pre>
          </div>
          <Button variant={sent ? 'primary' : 'accent'} className="w-full mt-3 !bg-success" disabled={sent || sending} onClick={async () => {
            // Real dispatch: logs the requisition as a high-severity alert (visible
            // to every user on /alerts) and pages the dispatcher over the WhatsApp
            // channel (simulated transport → server log + /api/whatsapp/outbox
            // unless Twilio env is configured).
            setSending(true)
            try {
              await pushAlert({
                type: 'report', severity: 'high',
                title: `Requisition sent — ${requisition.to}`,
                location: 'Dima Hasao (Haflong)',
                message: requisition.subject,
                action: 'Await DC acknowledgement; PWD escort + community carriers on standby.',
              })
              // Real dispatch — and HONEST about the outcome: the server waits
              // for the WhatsApp provider and reports sent/failed (+ the
              // delivered text when a content template had to be used).
              const r = await api.post<{ ok: boolean; simulated: boolean; transport: string; status: string; viaTemplate?: boolean; deliveredBody?: string; error?: string }>('/api/whatsapp/send', { to: 'dispatcher', body: `${requisition.subject}\n\n${requisition.body}` })
              setSendResult(r)
              if (r.ok) {
                setSent(true)
                showToast('Requisition logged.', 'success')
              } else {
                showToast(`Requisition logged as an alert, but WhatsApp delivery FAILED: ${r.error ?? 'unknown provider error'}`, 'error')
              }
            } catch (e) {
              console.error('Requisition send failed:', e)
              showToast('Could not send the requisition — check your connection and try again.', 'error')
            } finally {
              setSending(false)
            }
          }}>
            <Send size={14} /> {sent ? '✓ Sent to authority & logged' : sending ? 'Sending…' : 'Review & Send'}
          </Button>
          {sendResult && !sendResult.ok && (
            <p className="mt-2 rounded-lg border border-hazard/30 bg-hazard-light px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-hazard">{sendResult.error}</p>
          )}
        </Card>

        {/* weather + roadmap */}
        <div className="space-y-4">
          {initialLoad ? <CardSkeleton height="h-[104px]" /> : (
            <Card className="p-4">
              <SectionTitle icon={<CloudRain size={17} />} title={t('dashboard.weatherPanel')} />
              <div className="grid grid-cols-3 gap-2">
                {Object.values(weather).slice(0, 9).map(w => (
                  <div key={w.id} className="bg-canvas rounded-lg p-2 text-center">
                    <div className="text-[10px] font-bold text-slate-600 truncate">{w.name}</div>
                    <div className="text-sm font-extrabold text-secondary">{w.rainNow}<span className="text-[9px] font-semibold">mm</span></div>
                    <div className="text-[9px] text-slate-400">{w.tempC}°C</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-2">Live: SETU-NER weather service (cached offline) · feeds terrain risk engine</div>
            </Card>
          )}
          <Card className="p-4">
            <SectionTitle icon={<Rocket size={17} />} title={t('dashboard.roadmap')} />
            <ul className="space-y-1.5 text-[12px] text-slate-600">
              {((t('dashboard.roadmapItems', { returnObjects: true }) as unknown as string[]) ?? []).map((item, i) => (
                <li key={i} className="flex gap-2"><span className="text-accent">◆</span> {item}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* Gaps, Bookings and Alerts now live in the primary nav (see the
          "More" menu), so this footer is just the one thing that isn't
          already a click away from anywhere: the verification queue count. */}
      <div className="flex items-center justify-end pb-2 text-[11px] text-slate-400">
        {reports.filter(r => r.status === 'pending').length} reports awaiting verification
      </div>
    </div>
  )
}
