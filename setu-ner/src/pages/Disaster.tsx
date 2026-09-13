import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Siren, HeartPulse, Warehouse, Tent, Route as RouteIcon, XCircle, Users, Activity, RefreshCw, MapPin, AlertTriangle } from 'lucide-react'
import MapView from '../components/MapView'
import { Card, SectionTitle, Button, Pill } from '../components/ui'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import { FACILITIES, SEGMENTS } from '../data/ner'
import { api } from '../lib/api'

// Shape of GET /api/analysis/disaster (see server/src/engine/analysis.ts).
interface SituationReport {
  severity: 'low' | 'moderate' | 'high' | 'critical'
  summary: string
  affectedDistricts: { districtId: string; name: string; state: string; severity: 'low' | 'moderate' | 'high' | 'critical'; note: string }[]
  recommendedActions: string[]
  live: boolean
  generatedAt: string
  model: string | null
  reason: string | null
}

const severityTone: Record<SituationReport['severity'], 'green' | 'amber' | 'orange' | 'red'> = {
  low: 'green', moderate: 'amber', high: 'orange', critical: 'red',
}

// report.model is "<vendor>:<model>" — pull out just the vendor for the
// pill so it reflects whichever provider is actually configured (Groq by
// default) instead of a hardcoded name.
function providerLabel(model: string | null): string {
  const vendor = model?.split(':')[0]
  if (!vendor) return 'AI'
  return vendor.charAt(0).toUpperCase() + vendor.slice(1)
}

function SituationReportPanel() {
  const [report, setReport] = useState<SituationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (refresh: boolean) => {
    setLoading(true)
    const call = refresh ? api.post<SituationReport>('/api/analysis/disaster/refresh') : api.get<SituationReport>('/api/analysis/disaster')
    call.then(r => { setReport(r); setError(null) })
      .catch(() => setError('Could not load the situation report — is the API reachable?'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(false) }, [])

  return (
    <Card className="p-4">
      <SectionTitle
        icon={<Activity size={17} />}
        title="Situation report"
        sub="AI-fused view of live signals"
        right={<Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => load(true)} disabled={loading} aria-label="Refresh situation report"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></Button>}
      />
      {loading && !report ? (
        <p className="text-[12px] text-slate-400">Assembling situation report…</p>
      ) : error && !report ? (
        <p className="text-[12px] text-slate-500">{error}</p>
      ) : report ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone={severityTone[report.severity]}>{report.severity.toUpperCase()}</Pill>
            {/* report.model is "<vendor>:<model>" (e.g. "groq:openai/gpt-oss-120b")
                whichever provider VISION_PROVIDER/ANALYSIS_PROVIDER is actually set
                to — this used to say "Gemini live" unconditionally even when the
                configured (and default) provider is Groq. */}
            <Pill tone={report.live ? 'blue' : 'slate'}>{report.live ? `● ${providerLabel(report.model)} live` : 'Offline summary'}</Pill>
            <span className="text-[10px] text-slate-400">{new Date(report.generatedAt).toLocaleString('en-IN')}</span>
          </div>

          <p className="text-[12px] text-slate-600 leading-relaxed">{report.summary}</p>

          {report.model && (
            <p className="text-[10px] text-slate-400">
              {report.live ? `Model: ${report.model}` : `Reason: ${report.reason ?? 'unavailable'}`}
            </p>
          )}
          {!report.live && !report.model && report.reason && (
            <p className="text-[10px] text-slate-400">Reason: {report.reason}</p>
          )}

          {report.affectedDistricts.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Affected districts</div>
              {report.affectedDistricts.map(d => (
                <div key={d.districtId} className="flex items-start gap-2 border border-hazard/20 bg-hazard-light rounded-lg px-2.5 py-1.5">
                  <MapPin size={13} className="text-hazard shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700 text-[11px]">{d.name}</span>
                      <Pill tone={severityTone[d.severity]}>{d.severity}</Pill>
                    </div>
                    <div className="text-[10px] text-slate-500">{d.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {report.recommendedActions.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recommended actions</div>
              <ul className="space-y-1">
                {report.recommendedActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                    <AlertTriangle size={12} className="text-accent-text shrink-0 mt-0.5" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  )
}

export default function Disaster() {
  const { t } = useTranslation()
  const { disasterMode, disasterInfo, toggleDisaster, vehicles, reports } = useStore()
  const { showToast } = useToast()

  const camps = FACILITIES.filter(f => f.type === 'relief_camp')
  const hospitals = FACILITIES.filter(f => f.type === 'hospital')
  const warehouses = FACILITIES.filter(f => f.type === 'warehouse' || f.type === 'depot')
  const stalled = vehicles.filter(v => v.status === 'halted')
  const verifiedBlocked = reports.filter(r => r.severity === 'impassable' && r.status === 'verified')

  return (
    <div className="h-full grid lg:grid-cols-[360px_1fr]">
      <div className="p-4 space-y-3 overflow-auto thin-scroll bg-canvas">
        <Card className={`p-4 ${disasterMode ? 'contour-field bg-gradient-to-br from-hazard to-hazard-dark text-white' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${disasterMode ? 'bg-white/20' : 'bg-hazard-light text-hazard'}`}>
              <Siren size={22} />
            </div>
            <div className="flex-1">
              <h2 className="font-extrabold text-sm">{disasterMode ? t('disaster.active') : t('dashboard.disasterOff')}</h2>
              <p className={`text-[11px] ${disasterMode ? 'text-white/85' : 'text-slate-500'}`}>{t('dashboard.disasterBody')}</p>
            </div>
          </div>
          {disasterMode && disasterInfo.activatedBy && (
            <p className="mt-2 text-[11px] text-white/80">Activated by <strong>{disasterInfo.activatedBy}</strong>{disasterInfo.activatedAt ? ` at ${new Date(disasterInfo.activatedAt).toLocaleString('en-IN')}` : ''} · visible to all users</p>
          )}
          <Button variant={disasterMode ? 'ghost' : 'hazard'} className="w-full mt-3" onClick={() => toggleDisaster().catch(() => showToast('Could not change disaster mode — officials/admins only, and the API must be reachable.', 'error'))}>
            {disasterMode ? t('disaster.deactivate') : t('dashboard.disasterOff')}
          </Button>
        </Card>

        <SituationReportPanel />

        <Card className="p-4">
          <SectionTitle icon={<RouteIcon size={17} />} title={t('disaster.corridors')} />
          <div className="space-y-2 text-[12px]">
            {['E16', 'E01', 'E11'].map(id => {
              const s = SEGMENTS.find(x => x.id === id)!
              return (
                <div key={id} className="flex items-center gap-2 border border-secondary/20 bg-secondary-light rounded-lg px-2.5 py-2">
                  <RouteIcon size={14} className="text-secondary shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-secondary">{s.name}</div>
                    <div className="text-[10px] text-slate-500">Guwahati → staging (Dimapur/Diphu) — open, escorted priority</div>
                  </div>
                  <Pill tone="blue">open</Pill>
                </div>
              )
            })}
            <div className="flex items-center gap-2 border border-accent/30 bg-accent-light rounded-lg px-2.5 py-2">
              <RouteIcon size={14} className="text-accent-text shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-accent-text">{t('disaster.lastKnown')}</div>
                <div className="text-[10px] text-slate-500">Jowai–Umrangso trail (dashed amber) — verify by radio before use</div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle icon={<XCircle size={17} />} title={t('disaster.cutoff')} />
          <div className="space-y-2 text-[12px]">
            {[
              { place: 'Haflong / Dima Hasao hills', families: '~120 families in camp', convoys: stalled.length },
              { place: 'Umrangso & adjacent villages', families: '~6 villages cut', convoys: 1 },
            ].map(x => (
              <div key={x.place} className="border border-hazard/30 bg-hazard-light rounded-lg px-3 py-2">
                <div className="font-bold text-hazard flex items-center gap-1.5"><XCircle size={13} /> {x.place}</div>
                <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1"><Users size={10} /> {x.families} · {x.convoys} convoy(s) staged</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Tent size={16} />, n: camps.length, label: t('disaster.facilities').split('·')[0] },
            { icon: <HeartPulse size={16} />, n: hospitals.length, label: 'Hospitals' },
            { icon: <Warehouse size={16} />, n: warehouses.length, label: 'Warehouses/depots' },
          ].map((x, i) => (
            <Card key={i} className="p-3 text-center">
              <div className="flex justify-center text-secondary">{x.icon}</div>
              <div className="text-xl font-extrabold tracking-tightest tabular-nums text-slate-800">{x.n}</div>
              <div className="text-[9px] font-semibold text-slate-500">{x.label}</div>
            </Card>
          ))}
        </div>

        <Card className="p-3 text-[11px] text-slate-500">
          <strong className="text-slate-700">Verified blockages driving this view:</strong>
          {verifiedBlocked.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {verifiedBlocked.map(r => <li key={r.id}>{r.description.slice(0, 70)}…</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-slate-400">No verified blockage reports yet.</p>
          )}
        </Card>
      </div>

      <div className="relative min-h-[420px] lg:min-h-full">
        <MapView layers={{ roads: true, facilities: true, vehicles: true, reports: true, alerts: true }} disaster={disasterMode} focus={[25.35, 93.0]} focusZoom={9} />
      </div>
    </div>
  )
}
