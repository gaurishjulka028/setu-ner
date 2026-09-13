import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { Truck, Users, PackageCheck, Handshake, Snowflake } from 'lucide-react'
import { Card, SectionTitle, Button, Pill, RowSkeleton, EmptyState } from '../components/ui'
import { useToast } from '../components/Toast'
import { useStore } from '../store/useStore'
import { DISTRICTS, NODES, COLD_CHAIN } from '../data/ner'
import { CARGO_LABEL, timeAgo } from '../lib/format'
import { api } from '../lib/api'
import type { CargoType, ColdChainFacility, Booking } from '../types'

// Shelf life (hours) per perishable cargo. Missing cargo = non-perishable.
const SHELF_HOURS: Partial<Record<CargoType, number>> = { pharma: 48, medicine: 96, agri: 72, food: 120 }

type EtaInfo = { etaHours: number; riskMax: number }

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Nearest usable cold store to the destination HQ (skip full/breached hubs)
const nearestColdStore = (districtId: string): ColdChainFacility | null => {
  const d = NODES[districtId as keyof typeof NODES] ?? NODES.GHY
  let best: ColdChainFacility | null = null, bd = Infinity
  for (const f of COLD_CHAIN) {
    if (f.tempStatus === 'critical' || f.utilizationPct >= 95) continue
    const dkm = haversineKm(d, f)
    if (dkm < bd) { bd = dkm; best = f }
  }
  return best
}

const COMMUNITY = [
  { name: 'Jaintia Village Transport Co-op', area: 'Jowai–Umrangso hills', cap: '1.5 t shared taxi', note: 'Operates even when HGVs cannot' },
  { name: 'CCpur Local Van Union', area: 'Churachandpur block', cap: '2 t vans', note: 'Daily bazaar route, medicine priority' },
  { name: 'Garo Hills SHG Carrier Network', area: 'Tura–Nongstoin', cap: '1 t pickups', note: 'Women-led, last-mile to villages' },
  { name: 'Mizo Hill Porter & Pony Collective', area: 'Lunglei–Champhai trails', cap: '0.4 t / porter', note: 'Foot-trail reach beyond roads' },
]

export default function Bookings() {
  const { t } = useTranslation()
  const { bookings, addBooking, initialLoad, season } = useStore()
  const { showToast } = useToast()
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { shipper: '', fromDistrict: 'GHY', toDistrict: 'HFL', cargo: 'medicine' as CargoType, weightT: 5, lastMile: true, contactPhone: '' },
  })
  const [done, setDone] = useState(false)

  // Engine ETA/delay per perishable booking: same POST /api/route-suggestion
  // the PlanRoute screen calls, so spoilage compares risk-engine time vs the
  // shelf-life lookup above (SHELF_HOURS).
  const [eta, setEta] = useState<Record<string, EtaInfo>>({})
  useEffect(() => {
    let cancelled = false
    bookings.filter(b => SHELF_HOURS[b.cargo]).slice(0, 8).forEach(b => {
      if (eta[b.id]) return
      const from = NODES[b.fromDistrict as keyof typeof NODES]?.name ?? b.fromDistrict
      const to = NODES[b.toDistrict as keyof typeof NODES]?.name ?? b.toDistrict
      api.post<{ primary: { timeHours: number; delayHours: number; riskMax: number } }>('/api/route-suggestion', {
        origin: from, destination: to, cargo: b.cargo, season,
      }).then(r => { if (!cancelled) setEta(m => ({ ...m, [b.id]: { etaHours: r.primary.timeHours + r.primary.delayHours, riskMax: r.primary.riskMax } })) })
        .catch(() => { if (!cancelled) setEta(m => ({ ...m, [b.id]: { etaHours: -1, riskMax: -1 } })) })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, season])

  const onSubmit = async (d: any) => {
    try {
      await addBooking({ ...d, contactPhone: d.contactPhone?.trim() || undefined })
      setDone(true)
      setTimeout(() => setDone(false), 4000)
      reset({ ...d, shipper: '' })
    } catch (e) {
      console.error('Failed to submit booking:', e)
      showToast('Could not submit the booking — check your connection and try again.', 'error')
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto grid lg:grid-cols-3 gap-4">
      <div className="space-y-4">
        <Card className="p-4">
          <SectionTitle icon={<Truck size={18} />} title={t('booking.title')} sub={t('booking.sub')} />
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <label className="block text-xs">
              <span className="font-bold text-slate-500">Shipper / org</span>
              <input {...register('shipper', { required: true })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" placeholder="Your organisation" />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                <span className="font-bold text-slate-500">{t('common.from')}</span>
                <select {...register('fromDistrict')} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  {DISTRICTS.map(d => <option key={d.id} value={d.id}>{d.hq}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <span className="font-bold text-slate-500">{t('common.to')}</span>
                <select {...register('toDistrict')} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  {DISTRICTS.map(d => <option key={d.id} value={d.id}>{d.hq}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                <span className="font-bold text-slate-500">{t('common.cargo')}</span>
                <select {...register('cargo')} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  {Object.entries(CARGO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <span className="font-bold text-slate-500">Tonnes</span>
                <input type="number" min={0.5} step={0.5} {...register('weightT', { valueAsNumber: true })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" {...register('lastMile')} className="accent-primary" />
              <Handshake size={14} className="text-secondary" /> Require last-mile community carrier
            </label>
            <label className="block text-xs">
              <span className="font-bold text-slate-500">WhatsApp number <span className="font-normal text-slate-400">(optional — booking confirmation + TRACK replies)</span></span>
              <input type="tel" inputMode="numeric" placeholder="98765 43210" {...register('contactPhone', { pattern: /^[\d\s+()-]{8,20}$/ })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </label>
            <Button type="submit" variant="accent" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Booking…' : t('booking.book')}</Button>
            {done && <div className="text-[11px] text-success font-bold text-center">✓ Booking requested — carrier matching in progress</div>}
          </form>
        </Card>

        <Card className="p-4">
          <SectionTitle icon={<Users size={17} />} title={t('booking.community')} />
          <div className="space-y-2">
            {COMMUNITY.map(c => (
              <div key={c.name} className="border border-slate-100 rounded-lg p-2.5 text-[12px]">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">🤝 {c.name}</div>
                <div className="text-[11px] text-secondary font-semibold mt-0.5">{c.area} · {c.cap}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{c.note}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="p-4">
          <SectionTitle icon={<PackageCheck size={17} />} title={t('booking.stage')} sub="Warehouse → depot → village (tracking loop closes at the village)" />
          <div className="space-y-2">
            {initialLoad ? (
              <><RowSkeleton lines={2} /><RowSkeleton lines={2} /><RowSkeleton lines={2} /></>
            ) : bookings.length ? (
              bookings.map(b => (
                <div key={b.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="font-mono text-[12px] font-bold text-slate-700">{b.id} · {CARGO_LABEL[b.cargo]} ({b.weightT}t)</div>
                    <div className="flex items-center gap-2">
                      {b.lastMile && <Pill tone="blue">🤝 last-mile</Pill>}
                      <Pill tone={b.status === 'delivered' ? 'green' : b.status === 'requested' ? 'amber' : 'blue'}>{b.status.replace('_', ' ')}</Pill>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {b.shipper} · {DISTRICTS.find(d => d.id === b.fromDistrict)?.hq ?? b.fromDistrict} → {DISTRICTS.find(d => d.id === b.toDistrict)?.hq ?? b.toDistrict}
                    {b.communityCarrier && <> · <strong className="text-secondary">{b.communityCarrier}</strong></>}
                    {' · '}{timeAgo(b.createdAt)}
                  </div>
                  <div className="flex items-center gap-1 mt-2.5 text-[10px] font-bold">
                    <Stage done={b.warehouseOut} label={t('booking.whOut')} />
                    <span className={`flex-1 h-1 rounded ${b.depotReached ? 'bg-success' : 'bg-slate-200'}`} />
                    <Stage done={b.depotReached} label={t('booking.depot')} />
                    <span className={`flex-1 h-1 rounded ${b.villageReceived ? 'bg-success' : 'bg-slate-200'}`} />
                    <Stage done={b.villageReceived} label={t('booking.village')} />
                  </div>
                  <Spoilage b={b} eta={eta[b.id]} />
                </div>
              ))
            ) : (
              <EmptyState icon={<PackageCheck size={18} />} title="No bookings yet" body="Requests you submit on the left will show up here, tracked from warehouse to village." />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// Spoilage-risk pill for perishable cargo: risk-engine ETA (incl. weather
// delay) vs the shelf-life lookup. Amber/red rows suggest the nearest usable
// cold-storage hub as a staging option.
function Spoilage({ b, eta }: { b: Booking; eta?: EtaInfo }) {
  const shelf = SHELF_HOURS[b.cargo]
  if (!shelf) return null
  if (!eta) return <div className="mt-1.5 text-[10px] text-slate-400 font-semibold animate-pulse">Risk-engine ETA…</div>
  if (eta.etaHours < 0) return null
  const ratio = eta.etaHours / shelf
  const tone = ratio <= 0.6 ? 'green' : ratio <= 0.9 ? 'amber' : 'red'
  const dest = DISTRICTS.find(d => d.id === b.toDistrict)
  const cc = tone !== 'green' ? nearestColdStore(b.toDistrict) : null
  const ccKm = cc && dest ? Math.round(haversineKm(cc, NODES[dest.id as keyof typeof NODES] ?? { lat: 25.5, lng: 91.5 })) : 0
  const free = cc ? Math.max(0, Math.round(cc.capacityUnits * (1 - cc.utilizationPct / 100))) : 0
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Pill tone={tone}>
        {tone === 'green' ? 'Spoilage: low' : tone === 'amber' ? 'Spoilage: watch ETA' : 'Spoilage: high risk'} · ETA {Math.round(eta.etaHours)}h vs {shelf}h shelf
      </Pill>
      {cc && (
        <span className="text-[10px] text-secondary font-semibold flex items-center gap-1">
          <Snowflake size={11} /> Stow at {cc.name} — {ccKm} km from {dest?.hq}, {free} units free
        </span>
      )}
    </div>
  )
}

function Stage({ done, label }: { done?: boolean; label: string }) {
  return (
    <span className={`px-2 py-1 rounded-full whitespace-nowrap ${done ? 'bg-success text-white' : 'bg-slate-100 text-slate-400'}`}>
      {done ? '✓ ' : ''}{label}
    </span>
  )
}
