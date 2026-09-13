import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Building2, Truck, PackageCheck, PackageX, Snowflake, ArrowRight, Clock,
  ShieldAlert, Navigation, FileText,
} from 'lucide-react'
import { Card, SectionTitle, Kpi, Pill, EmptyState, Button } from '../components/ui'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { DISTRICTS } from '../data/ner'
import { CARGO_LABEL, timeAgo } from '../lib/format'
import type { StockLevels, Booking } from '../types'

// ── Company Console (role: logistics) ──────────────────────────────────────
// The freight operator's home screen: booking pipeline, the districts whose
// stock is critical (i.e. where demand — and business — will come from),
// cold-chain warnings and one-click jumps to the working pages (Bookings,
// Gaps, Plan Route, Track). Read-only aggregation here; the work happens on
// the linked pages.

const statusTone = (s: Booking['status']): 'amber' | 'blue' | 'green' | 'red' =>
  s === 'requested' ? 'amber' : s === 'in_transit' ? 'blue' : s === 'delivered' ? 'green' : 'red'

export default function CompanyConsole() {
  const { t } = useTranslation()
  const { bookings, user, initialLoad } = useStore()
  const [stocks, setStocks] = useState<StockLevels[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<StockLevels[]>('/api/stock').then(d => { if (!cancelled) setStocks(d) }).catch(() => { if (!cancelled) setStocks([]) })
    return () => { cancelled = true }
  }, [])

  const active = bookings.filter(b => b.status !== 'delivered')
  const inTransit = bookings.filter(b => b.status === 'in_transit')
  const delivered = bookings.filter(b => b.status === 'delivered')
  const tonnage = bookings.reduce((a, b) => a + b.weightT, 0)

  const critical = useMemo(() => (stocks ?? [])
    .map(s => {
      const d = DISTRICTS.find(x => x.id === s.districtId)
      const worst = Math.min(s.medicine, s.food, s.fuel, s.construction)
      return { districtId: s.districtId, name: d?.name ?? s.districtId, hq: d?.hq ?? '', worst }
    })
    .filter(r => r.worst <= 5)
    .sort((a, b) => a.worst - b.worst)
    .slice(0, 5), [stocks])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <Card className="p-4 flex flex-wrap items-center gap-3 justify-between">
        <SectionTitle icon={<Building2 size={18} />} title={t('company.title')}
          sub={`${user?.org ?? t('auth.logistics')} · ${user?.name ?? ''}`} />
        <div className="flex flex-wrap gap-2">
          <Link to="/bookings"><Button variant="primary"><PackageCheck size={14} /> {t('nav.bookings')}</Button></Link>
          <Link to="/gaps"><Button variant="secondary"><PackageX size={14} /> {t('nav.gaps')}</Button></Link>
          <Link to="/plan-route"><Button variant="accent"><Navigation size={14} /> {t('nav.plan')}</Button></Link>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Truck size={18} />} label={t('company.activeBookings')} value={active.length} sub={`${bookings.length} total`} tone="primary" />
        <Kpi icon={<Clock size={18} />} label={t('company.inTransit')} value={inTransit.length} sub={`${delivered.length} ${t('company.delivered')}`} tone="green" />
        <Kpi icon={<PackageCheck size={18} />} label={t('company.tonnage')} value={`${Math.round(tonnage)} t`} sub={t('company.tonnageSub')} tone="accent" />
        <Kpi icon={<ShieldAlert size={18} />} label={t('company.criticalDistricts')} value={critical.length} sub={t('company.criticalSub')} tone="red" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent bookings */}
        <Card className="p-4 lg:col-span-2">
          <SectionTitle icon={<Truck size={16} />} title={t('company.recentBookings')} sub={t('company.recentSub')} />
          {initialLoad ? (
            <EmptyState icon={<Clock size={18} />} title="Loading…" body="" />
          ) : bookings.length ? (
            <div className="mt-2 space-y-2">
              {bookings.slice(0, 7).map(b => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5 hover:border-slate-200">
                  <Pill tone={statusTone(b.status)}>{b.status.replace('_', ' ')}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-slate-700 truncate">
                      {CARGO_LABEL[b.cargo]} · {b.weightT}t — {DISTRICTS.find(d => d.id === b.fromDistrict)?.hq ?? b.fromDistrict} → {DISTRICTS.find(d => d.id === b.toDistrict)?.hq ?? b.toDistrict}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">{b.id} · {b.shipper}{b.communityCarrier ? ` · last-mile: ${b.communityCarrier}` : ''} · {timeAgo(b.createdAt)}</div>
                  </div>
                  <Link to="/track" className="text-[11px] font-bold text-primary hover:underline shrink-0">{t('common.viewMap')} →</Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<PackageCheck size={18} />} title={t('company.noBookings')} body={t('company.noBookingsBody')} />
          )}
          <Link to="/bookings" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
            {t('company.allBookings')} <ArrowRight size={12} />
          </Link>
        </Card>

        {/* Demand signals + cold chain */}
        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle icon={<PackageX size={16} />} title={t('company.demandSignal')} sub={t('company.demandSub')} />
            {critical.length ? (
              <div className="mt-2 space-y-2">
                {critical.map(c => (
                  <div key={c.districtId} className="flex items-center gap-2.5 rounded-lg border border-slate-100 p-2.5">
                    <Pill tone={c.worst <= 3 ? 'red' : 'amber'}>{c.worst} {t('gaps.daysStock')}</Pill>
                    <div className="min-w-0 flex-1 text-[12px] font-bold text-slate-700 truncate">{c.name}{c.hq ? ` (${c.hq})` : ''}</div>
                    <Link to="/bookings" className="text-primary shrink-0"><FileText size={14} /></Link>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<PackageCheck size={18} />} title={t('company.noGaps')} body={t('company.noGapsBody')} />
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle icon={<Snowflake size={16} />} title={t('company.chainNote')} sub={t('company.chainSub')} />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t('company.chainBody')}</p>
            <Link to="/gaps" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
              {t('company.openGaps')} <ArrowRight size={12} />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
