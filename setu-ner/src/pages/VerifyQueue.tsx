import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, CheckCircle2, XCircle, Loader2, MapPin, Camera, ImageOff,
  Users, Clock,
} from 'lucide-react'
import { Card, SectionTitle, Pill, EmptyState, Button, RowSkeleton } from '../components/ui'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import { mediaUrl } from '../lib/api'
import { timeAgo } from '../lib/format'

// ── Verification Queue (roles: official, admin) ────────────────────────────
// Field officers triage citizen incident reports: photo (with the AI scene
// analysis attached at upload), location, reporter trust — then approve (the
// road status flips and the reporter earns points/badges) or reject.
// Same server action as the inline verifier on the Report page
// (PATCH /api/reports/:id/verify — official/admin enforced server-side).

const statusPill = (s: string) =>
  s === 'verified' ? <Pill tone="green"><CheckCircle2 size={11} /> verified</Pill>
    : s === 'rejected' ? <Pill tone="red"><XCircle size={11} /> rejected</Pill>
      : <Pill tone="amber"><Clock size={11} /> pending</Pill>

export default function VerifyQueue() {
  const { t } = useTranslation()
  const { reports, verifyReport, initialLoad } = useStore()
  const { showToast } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending')

  const queue = useMemo(() => {
    const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt)
    return filter === 'all' ? sorted : sorted.filter(r => r.status === filter)
  }, [reports, filter])

  const pendingCount = reports.filter(r => r.status === 'pending').length
  const verifiedCount = reports.filter(r => r.status === 'verified').length
  const rejectedCount = reports.filter(r => r.status === 'rejected').length

  const act = async (id: string, approve: boolean) => {
    setBusyId(id)
    try {
      await verifyReport(id, approve)
      showToast(approve ? 'Report verified — road status updated and the reporter credited.' : 'Report rejected — the road status was rolled back.', approve ? 'success' : 'info')
    } catch (e) {
      console.error('Failed to update report status:', e)
      showToast('Could not update the report — check your connection and try again.', 'error')
    } finally { setBusyId(null) }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <Card className="p-4 flex flex-wrap items-center gap-4 justify-between">
        <SectionTitle icon={<ShieldCheck size={18} />} title={t('verify.title')} sub={t('verify.sub')} />
        <div className="flex gap-1.5">
          {(['pending', 'verified', 'rejected', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${filter === f ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {t(`verify.${f}`)}{f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-3"><Clock size={18} className="text-accent" /><div><div className="text-xl font-extrabold text-slate-800">{pendingCount}</div><div className="text-[11px] font-semibold text-slate-400">{t('verify.pending')}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><CheckCircle2 size={18} className="text-success" /><div><div className="text-xl font-extrabold text-slate-800">{verifiedCount}</div><div className="text-[11px] font-semibold text-slate-400">{t('verify.verified')}</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><XCircle size={18} className="text-hazard" /><div><div className="text-xl font-extrabold text-slate-800">{rejectedCount}</div><div className="text-[11px] font-semibold text-slate-400">{t('verify.rejected')}</div></div></Card>
      </div>

      {initialLoad ? (
        <Card className="p-4 space-y-2"><RowSkeleton lines={3} /><RowSkeleton lines={3} /></Card>
      ) : queue.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<ShieldCheck size={22} />} title={t('verify.empty')} body={t('verify.emptyBody')} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {queue.map(r => (
            <Card key={r.id} className="p-4 flex gap-3">
              {/* photo */}
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-canvas">
                {r.photoUrl ? (
                  <img src={mediaUrl(r.photoUrl)} alt={r.type} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-300"><ImageOff size={18} /><span className="text-[9px] font-bold">no photo</span></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill tone={r.severity === 'impassable' ? 'red' : r.severity === 'partial' ? 'amber' : 'blue'}>{r.type}</Pill>
                  {statusPill(r.status)}
                  {r.photoSeverity && <Pill tone={r.photoSeverity === 'impassable' ? 'red' : r.photoSeverity === 'partial' ? 'amber' : 'green'}><Camera size={10} /> AI: {r.photoSeverity}</Pill>}
                </div>
                <div className="mt-1.5 line-clamp-2 text-[12px] font-semibold text-slate-700">{r.description || '—'}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <MapPin size={10} /> {r.location ?? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`} · {timeAgo(r.createdAt)}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                  <Users size={10} /> {r.reporter} · {r.reporterRole} · conf {Math.round((r.confidence ?? 0) * 100)}%
                </div>
                {r.status === 'pending' && (
                  <div className="mt-2.5 flex gap-2">
                    <Button variant="primary" className="flex-1 !bg-success" disabled={busyId === r.id} onClick={() => act(r.id, true)}>
                      {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <><CheckCircle2 size={13} /> {t('verify.approve')}</>}
                    </Button>
                    <Button variant="hazard" className="flex-1" disabled={busyId === r.id} onClick={() => act(r.id, false)}>
                      {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <><XCircle size={13} /> {t('verify.reject')}</>}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
