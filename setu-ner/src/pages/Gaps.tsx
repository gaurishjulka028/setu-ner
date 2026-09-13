import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Send, AlertTriangle, Snowflake, Ship } from 'lucide-react'
import MapView from '../components/MapView'
import { Card, SectionTitle, Button, Pill, RowSkeleton, EmptyState } from '../components/ui'
import { DISTRICTS, COLD_CHAIN, SEGMENTS, isWaterway } from '../data/ner'
import { CARGO_LABEL } from '../lib/format'
import { api } from '../lib/api'
import type { StockLevels } from '../types'

const ccRank: Record<string, number> = { ok: 2, 'at-risk': 1, critical: 0 }
const ccTone = (s: string): 'green' | 'amber' | 'red' => (s === 'ok' ? 'green' : s === 'at-risk' ? 'amber' : 'red')
const ccStatus = (s: string) => (s === 'ok' ? 'Temp OK' : s === 'at-risk' ? 'At risk of thaw' : 'Critical')

export default function Gaps() {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [showCold, setShowCold] = useState(true)
  const [showWater, setShowWater] = useState(false)
  // Wired to the real GET /api/stock (Part 2 backend) here — this page
  // was still reading the static STOCKS bundle after Part 3, since that
  // frontend pass didn't cover it. null = still loading.
  const [stocks, setStocks] = useState<StockLevels[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<StockLevels[]>('/api/stock')
      .then(data => { if (!cancelled) setStocks(data) })
      .catch(() => { if (!cancelled) setStocks([]) })
    return () => { cancelled = true }
  }, [])

  const loading = stocks === null

  const rows = useMemo(() => (stocks ?? []).map(s => {
    const d = DISTRICTS.find(x => x.id === s.districtId)!
    const worst = Math.min(s.medicine, s.food, s.fuel, s.construction)
    const items = (Object.entries(s) as [string, number][])
      .filter(([k, v]) => k !== 'districtId' && v <= 7)
      .sort((a, b) => a[1] - b[1])
    return { ...s, name: d.name, hq: d.hq, state: d.state, worst, items }
  }).sort((a, b) => a.worst - b.worst), [stocks])

  const gapMap = useMemo(() => Object.fromEntries((stocks ?? []).map(s => [s.districtId, Math.min(s.medicine, s.food, s.fuel, s.construction)])), [stocks])
  const critical = rows.filter(r => r.worst <= 3)

  const cold = useMemo(() => [...COLD_CHAIN].sort((a, b) => ccRank[a.tempStatus] - ccRank[b.tempStatus]), [])
  const waterways = useMemo(() => SEGMENTS.filter(isWaterway), [])
  // Deterministic pseudo-load (30–74%) so the "underused capacity" claim is stable across reloads.
  const waterLoad = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return 30 + (h % 45) }

  const makeDraft = (name: string, items: [string, number][]) => {
    setSent(false)
    setDraft(
      `To: District Commissioner / Supply Officer, ${name}\n\n` +
      `URGENT REQUISITION (auto-drafted by SETU-NER supply-gap engine):\n` +
      `Critical stock levels detected — ${items.map(([k, v]) => `${CARGO_LABEL[k]}: ${v} days`).join('; ')}.\n\n` +
      `Requested action: release relief stocks / prioritise incoming convoys / arrange last-mile handoff. ` +
      `Two inbound convoys are currently affected by the Dima Hasao corridor blockage; reroute recommendations attached.\n\n` +
      `— SETU-NER control room (review & send)`
    )
  }

  return (
    <div className="h-full grid lg:grid-cols-[400px_1fr]">
      <div className="p-4 space-y-3 overflow-auto thin-scroll bg-canvas">
        <Card className="p-4">
          <SectionTitle icon={<Package size={18} />} title={t('gaps.title')} sub={t('gaps.sub')} />
          <div className="space-y-2">
            {loading ? (
              <><RowSkeleton lines={2} /><RowSkeleton lines={2} /><RowSkeleton lines={2} /><RowSkeleton lines={2} /></>
            ) : rows.length ? (
              rows.map(r => (
                <div key={r.districtId} className={`border rounded-lg p-2.5 ${r.worst <= 3 ? 'border-hazard/40 bg-hazard-light/40' : r.worst <= 7 ? 'border-caution/40 bg-caution-light/30' : 'border-slate-100'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[12px] text-slate-800">{r.hq}</span>
                    <Pill tone={r.worst <= 3 ? 'red' : r.worst <= 7 ? 'amber' : 'green'}>{r.worst} {t('gaps.daysStock')}</Pill>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.items.length ? r.items.map(([k, v]) => (
                      <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${v <= 3 ? 'bg-hazard text-white' : 'bg-caution/30 text-caution-text'}`}>
                        {CARGO_LABEL[k]} · {v}d
                      </span>
                    )) : <span className="text-[10px] text-success font-semibold">All commodities healthy</span>}
                  </div>
                  {r.worst <= 5 && (
                    <button onClick={() => makeDraft(r.name, r.items)} className="mt-2 text-[11px] font-bold text-secondary flex items-center gap-1 hover:underline">
                      <AlertTriangle size={11} /> {t('gaps.requisition')}
                    </button>
                  )}
                </div>
              ))
            ) : (
              <EmptyState icon={<Package size={18} />} title="No supply-gap data available" body="District stock levels will appear here once the backend reports them." />
            )}
          </div>
        </Card>

        {/* Cold chain: every perishable/vaccine district depends on these hubs */}
        <Card className="p-4">
          <SectionTitle icon={<Snowflake size={18} />} title="Cold chain status" sub="Refrigeration hubs — thaw risk, capacity, utilisation" />
          <div className="space-y-2">
            {cold.map(f => (
              <div key={f.id} className={`border rounded-lg p-2.5 ${f.tempStatus === 'critical' ? 'border-hazard/40 bg-hazard-light/40' : f.tempStatus === 'at-risk' ? 'border-caution/40 bg-caution-light/30' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[12px] text-slate-800 leading-tight">{f.name}</span>
                  <Pill tone={ccTone(f.tempStatus)}>{ccStatus(f.tempStatus)}</Pill>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {f.utilizationPct}% of {f.capacityUnits} units used
                  {f.tempStatus !== 'ok' && f.utilizationPct >= 85 ? ' · reroute perishables to nearest spare hub' : ''}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Waterways: underused freight capacity along NW-2 / Barak */}
        <Card className="p-4">
          <SectionTitle icon={<Ship size={18} />} title="Waterways (underused)" sub="Brahmaputra NW-2 & Barak — spare freight capacity" />
          <div className="space-y-2">
            {waterways.map(w => {
              const load = waterLoad(w.id)
              return (
                <div key={w.id} className="border border-slate-100 rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[12px] text-slate-800">{w.name.replace(/^NW-2 /, '')}</span>
                    <Pill tone="green">{load}% loaded</Pill>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {w.lengthKm} km · draft {w.draftM} m · {Math.round(100 - load)}% spare
                    {w.districtId === 'GHY' ? ' · relief corridor to Guwahati' : ''}
                  </div>
                </div>
              )
            })}
            <p className="text-[10px] text-secondary mt-1">Tip: PlanRoute surfaces river alternates when they clear roads on risk.</p>
          </div>
        </Card>
      </div>

      <div className="relative min-h-[420px] lg:min-h-full">
        <MapView layers={{ roads: true, gaps: true, facilities: true, vehicles: false, coldChain: showCold, waterway: showWater }} gapMap={gapMap} />
        <div className="absolute top-3 left-3 z-[500] bg-white/95 rounded-lg shadow-card px-3 py-2 text-[11px] font-semibold space-y-1">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-hazard inline-block" /> ≤3 days (critical · {critical.length})</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-caution inline-block" /> 4–7 days</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-success inline-block" /> ≥8 days</div>
          <div className="flex gap-2 pt-1.5 border-t border-slate-100">
            <label className="flex items-center gap-1.5 text-secondary cursor-pointer">
              <input type="checkbox" checked={showCold} onChange={e => setShowCold(e.target.checked)} /> ❄️ Cold chain
            </label>
            <label className="flex items-center gap-1.5 text-secondary cursor-pointer">
              <input type="checkbox" checked={showWater} onChange={e => setShowWater(e.target.checked)} /> 🚢 Waterways
            </label>
          </div>
        </div>

        {draft && (
          <div className="absolute bottom-3 right-3 z-[700] w-[min(92vw,380px)] slide-in">
            <Card className="p-4">
              <SectionTitle icon={<Send size={16} />} title={t('dashboard.requisition')} />
              <pre className="whitespace-pre-wrap text-[11px] text-slate-600 bg-canvas rounded-lg p-3 font-sans max-h-48 overflow-auto thin-scroll">{draft}</pre>
              <div className="flex gap-2 mt-3">
                <Button variant={sent ? 'ghost' : 'accent'} className="flex-1" onClick={() => setSent(true)}>
                  {sent ? '✓ Sent & logged' : 'Review & Send'}
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
