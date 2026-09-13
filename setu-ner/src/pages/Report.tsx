import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { Camera, MapPin, WifiOff, CloudUpload, Award, CheckCircle2, ShieldQuestion, LocateFixed, Loader2, X, ExternalLink } from 'lucide-react'
import MapView from '../components/MapView'
import { Card, SectionTitle, Button, Pill, statusPill, EmptyState } from '../components/ui'
import { useToast } from '../components/Toast'
import { useStore } from '../store/useStore'
import { DISTRICTS, SEGMENTS } from '../data/ner'
import { timeAgo } from '../lib/format'
import { api, mediaUrl } from '../lib/api'
import { classifyPhoto } from '../lib/photo'
import type { IncidentType, Severity } from '../types'

// Photo attached to a report draft. `url` is the server-stored photo path
// (POST /api/reports/photo → /uploads/photos/P-*.jpg); when the app is
// offline the image can only be read locally (preview = object URL) and is
// NOT uploaded — the queued report then carries no photoUrl.
interface PhotoState {
  name: string
  url?: string // server path when uploaded
  preview: string // object URL or server URL — what the <img> shows
  severity: Severity
  confidence: number
  source: 'server' | 'local'
  // From the server vision adapter (lib/vision.ts): how sure the AI is that
  // this is even a road/transport scene, what it thinks it shows, a one-line
  // justification, and which model produced it.
  relevance?: number
  incident?: string
  summary?: string
  provider?: 'openai' | 'gemini' | 'heuristic'
  model?: string
}

const SEVERITY_LABEL: Record<Severity, string> = { minor: 'Low', partial: 'High', impassable: 'Critical' }

function Summary({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="font-bold text-slate-700">{value}</div></div>
}

export default function ReportPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { online, addReport, reports, user, verifyReport, vehicles } = useStore()
  const { showToast } = useToast()
  const [pin, setPin] = useState<[number, number] | null>(null)
  const [photo, setPhoto] = useState<PhotoState | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [justQueued, setJustQueued] = useState(false)
  const [submitted, setSubmitted] = useState<{ reportId: string; alertId: string; affectedShipments: number; location: string; incident: string; severity: string; segmentId?: string } | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm({
    defaultValues: { type: 'landslide' as IncidentType, severity: 'partial' as Severity, description: '', location: '', districtId: 'HFL' },
  })

  // Citizens see their own submissions; officials/admins see the newest
  // reports as their verification queue (with the uploaded photos inline,
  // see the report cards below — the verify buttons act on these).
  const isOfficialViewer = user?.role === 'official' || user?.role === 'admin'
  const myReports = useMemo(() =>
    reports
      .filter(r => !user || isOfficialViewer || r.reporter === user.name)
      .slice(0, isOfficialViewer ? 12 : 8),
  [reports, user, isOfficialViewer])
  const submittedSegment = submitted?.segmentId ? SEGMENTS.find(segment => segment.id === submitted.segmentId) : undefined

  const useGps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setPin([p.coords.latitude, p.coords.longitude]),
        () => setPin([25.17, 93.01]), // Haflong fallback
        { timeout: 4000 },
      )
    } else setPin([25.17, 93.01])
  }

  // Attach → real pixel read + real upload. The image bytes (not the
  // filename) drive everything: an instant on-device canvas analysis for
  // the preview box, then — when online — an upload to
  // POST /api/reports/photo, where the server re-analyzes the stored bytes
  // and returns the viewable photoUrl persisted on the report.
  const onPhoto = async (f?: File) => {
    if (!f || !f.type.startsWith('image/')) {
      setPhotoError('Please attach an image file (JPEG or PNG works best).')
      return
    }
    setPhotoError(null)
    setAnalyzing(true)
    let local: { severity: Severity; confidence: number } | null = null
    try {
      local = await classifyPhoto(f) // reads actual pixels via canvas
    } catch {
      local = null
    }
    const draft: PhotoState = {
      name: f.name,
      preview: URL.createObjectURL(f),
      severity: local?.severity ?? 'minor',
      confidence: local?.confidence ?? 0.5,
      source: 'local',
    }
    setPhoto(draft)

    // Online → hand the real bytes to the server for storage + analysis.
    if (online) {
      try {
        const form = new FormData()
        form.append('photo', f)
        const res = await api.postForm<{ photoUrl: string; photoName: string; severity: Severity; confidence: number; relevance?: number; incident?: string; summary?: string; provider?: 'openai' | 'gemini' | 'heuristic'; model?: string }>('/api/reports/photo', form)
        const serverPreview = mediaUrl(res.photoUrl)
        if (serverPreview) URL.revokeObjectURL(draft.preview) // blob no longer needed
        setPhoto({
          name: res.photoName || f.name,
          url: res.photoUrl,
          preview: serverPreview ?? draft.preview,
          severity: res.severity,
          confidence: res.confidence,
          source: 'server',
          relevance: res.relevance,
          incident: res.incident,
          summary: res.summary,
          provider: res.provider,
          model: res.model,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        // Keep the local pixel-based read; the report just won't carry a
        // server photo (offline/unsupported-format photos never reach the DB).
        setPhotoError(`${msg} — photo kept locally, report will be submitted without an uploaded photo.`)
      }
    } else {
      setPhotoError('You are offline — the photo can be analyzed but not uploaded yet. It will be submitted without a server photo.')
    }
    setAnalyzing(false)
  }

  const clearPhoto = () => {
    if (photo?.preview.startsWith('blob:')) URL.revokeObjectURL(photo.preview)
    setPhoto(null)
    setPhotoError(null)
    setAnalyzing(false)
  }

  const onSubmit = async (data: { type: IncidentType; severity: Severity; description: string; location: string; districtId: string }) => {
    if (!pin) { showToast('Pin your location on the map or use GPS first.', 'info'); return }
    if (photo && analyzing) { showToast('Photo analysis is still running — wait a moment, then submit again.', 'info'); return }
    const nearest = SEGMENTS.map(segment => {
      const mid = segment.coords[Math.floor(segment.coords.length / 2)]
      return { segment, d: (mid[0] - pin[0]) ** 2 + (mid[1] - pin[1]) ** 2 }
    }).sort((a, b) => a.d - b.d)[0]
    const result = await addReport({
      type: data.type,
      severity: data.severity,
      description: data.description,
      location: data.location || nearest?.segment.name || 'Field location',
      lat: pin[0], lng: pin[1],
      districtId: data.districtId,
      segmentId: nearest.d < 0.05 ? nearest.segment.id : undefined,
      photoName: photo?.name,
      photoUrl: photo?.url,
      photoSeverity: photo?.severity,
      photoConfidence: photo?.confidence,
    })
    const affectedShipments = nearest ? vehicles.filter(vehicle => vehicle.path.includes(nearest.segment.id)).length : 0
    const location = data.location || nearest?.segment.name || 'Field location'
    setSubmitted({ reportId: result.report.id, alertId: result.alertId, affectedShipments, location, incident: data.type, severity: data.severity, segmentId: nearest?.segment.id })
    setJustQueued(true)
    setTimeout(() => setJustQueued(false), 5000)
    reset({ type: 'landslide', severity: 'partial', description: '', location: '', districtId: data.districtId })
    if (photo?.preview.startsWith('blob:')) URL.revokeObjectURL(photo.preview)
    setPhoto(null)
    setPhotoError(null)
  }

  const isOfficial = user?.role === 'official' || user?.role === 'admin'
  const sev = watch('severity')

  const handleVerify = async (id: string, approve: boolean) => {
    setVerifyingId(id)
    try {
      await verifyReport(id, approve)
    } catch (e) {
      console.error('Failed to update report status:', e)
      showToast('Could not update the report — check your connection and try again.', 'error')
    } finally {
      setVerifyingId(null)
    }
  }

  return (
    <div className="h-full grid lg:grid-cols-[420px_1fr]">
      <div className="p-4 space-y-3 overflow-auto thin-scroll bg-canvas">
        {/* offline banner */}
        {!online && (
          <Card className="p-3 bg-accent-light/70 border-l-4 !border-l-accent">
            <div className="flex items-start gap-2 text-[12px] font-semibold text-accent-text">
              <WifiOff size={16} className="shrink-0 mt-0.5" />
              <div>
                {t('report.queued')}
                <div className="font-normal text-[11px] mt-0.5">{t('syncPending')}</div>
              </div>
            </div>
          </Card>
        )}
        {online && justQueued && (
          <Card className="p-3 bg-success-light border-l-4 !border-l-success">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-success">
              <CloudUpload size={15} /> {t('report.synced')}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <SectionTitle icon={<Camera size={18} />} title={t('report.title')} sub={t('report.sub')} />
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                <span className="font-bold text-slate-500">Incident Type</span>
                <select {...register('type')} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  {[['damage', 'Road Damage'], ['landslide', 'Landslide'], ['flood', 'Flood'], ['accident', 'Accident'], ['weather', 'Weather Alert'], ['other', 'Other']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <span className="font-bold text-slate-500">Severity</span>
                <select {...register('severity')} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  <option value="minor">Low</option><option value="partial">High</option><option value="impassable">Critical</option>
                </select>
              </label>
            </div>
            <label className="text-xs block"><span className="font-bold text-slate-500">Location</span><input {...register('location')} placeholder="Road, village, or landmark" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" /></label>
            <label className="text-xs">
              <span className="font-bold text-slate-500">District</span>
              <select {...register('districtId')} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                {DISTRICTS.map(d => <option key={d.id} value={d.id}>{d.name}, {d.state}</option>)}
              </select>
            </label>
            <label className="text-xs block">
              <span className="font-bold text-slate-500">{t('report.description')}</span>
              <textarea {...register('description')} rows={3} required
                placeholder="Debris across road, water depth, stranded vehicles…"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </label>

            {/* photo + real CV classification (bytes, not filename) */}
            {!photo ? (
              <label className="block border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer transition-colors hover:border-primary hover:bg-primary-light/30 text-[12px] text-slate-500 font-semibold">
                <Camera size={20} className="mx-auto mb-1.5 text-slate-400" />
                {t('report.photo')} (tap to attach — analyzed from the image itself)
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPhoto(f) }} />
              </label>
            ) : (
              <div className="border border-slate-200 rounded-lg p-2">
                <div className="flex gap-2">
                  {photo.preview && (
                    <img src={photo.preview} alt={photo.name} className="h-16 w-20 object-cover rounded-md border border-slate-200 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1 text-[12px]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-slate-700 truncate">📷 {photo.name}</span>
                      <button type="button" onClick={clearPhoto} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Remove photo">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {analyzing ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Loader2 size={11} className="animate-spin" /> Reading image pixels…
                        </span>
                      ) : (
                        <>
                          Image read: <strong>{SEVERITY_LABEL[photo.severity]}</strong> · {(photo.confidence * 100).toFixed(0)}% confidence
                          {photo.source === 'server' && photo.url && (
                            <span className="text-success font-semibold"> · uploaded ✓</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {photo.source === 'server' && photo.url ? (
                  <a href={mediaUrl(photo.url)} target="_blank" rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                    <ExternalLink size={10} /> View uploaded photo on server
                  </a>
                ) : (
                  <div className="mt-1.5 text-[10px] text-accent-text font-semibold">
                    Photo is device-local only — it will not appear on the stored report (upload requires a connection).
                  </div>
                )}
              </div>
            )}
            {photo && !analyzing && (
              <div className="bg-secondary-light rounded-lg px-3 py-2 text-[11px] text-secondary">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldQuestion size={13} /> {t('report.photoAnalysis')}
                </div>
                <div className="mt-0.5">
                  {photo.relevance !== undefined && photo.relevance < 0.35 ? (
                    <div className="font-semibold text-accent-text">⚠ This doesn’t look like a road / disruption photo (scene relevance {(photo.relevance * 100).toFixed(0)}%). It will be attached, but it won’t raise the severity — please photograph the actual road.</div>
                  ) : (
                    <>Estimated severity from image content: <strong>{SEVERITY_LABEL[photo.severity]} ({photo.severity})</strong>{photo.incident && photo.incident !== 'none' ? <> · looks like <strong>{photo.incident}</strong></> : null} · confidence {(photo.confidence * 100).toFixed(0)}%</>
                  )}
                  {photo.summary && <div className="mt-0.5 italic">“{photo.summary}”</div>}
                  <div className="mt-0.5 opacity-80">
                    {photo.source !== 'server'
                      ? 'Read on-device from the photo’s pixels — not uploaded (no connection).'
                      : photo.provider && photo.provider !== 'heuristic'
                        ? `Vision model: ${photo.model} — understands scene content; unrelated photos score low.`
                        : 'Basic pixel heuristic (no vision model configured on the server — see VISION_PROVIDER in server/.env). Not object-aware; an official will verify.'}
                  </div>
                </div>
              </div>
            )}
            {photoError && <div className="text-[11px] font-semibold text-accent-text bg-accent-light/60 rounded-lg px-2.5 py-1.5">{photoError}</div>}

            {/* location */}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="text-xs flex-1" onClick={useGps}>
                <LocateFixed size={14} /> {t('report.useLocation')}
              </Button>
              <div className="flex-1 text-[11px] text-slate-500 flex items-center gap-1">
                <MapPin size={13} className="text-primary" />
                {pin ? `${pin[0].toFixed(3)}, ${pin[1].toFixed(3)}` : t('report.pinOnMap')}
              </div>
            </div>

            <Button type="submit" variant={sev === 'impassable' ? 'hazard' : 'primary'} className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : <>{sev === 'impassable' ? '🚨 ' : '📤 '}Submit Report</>}
            </Button>
            {!online && <div className="text-center text-[10px] text-accent-text font-semibold">↳ {t('report.queued')}</div>}
          </form>
        </Card>

        {submitted && (
          <Card className="border-l-4 !border-l-success p-4">
            <div className="flex items-center gap-2 text-base font-extrabold text-success"><CheckCircle2 size={18} /> REPORT RECEIVED ✓</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Summary label="Incident" value={submitted.incident} /><Summary label="Location" value={submitted.location} /><Summary label="Severity" value={submitted.severity === 'impassable' ? 'Critical' : submitted.severity === 'partial' ? 'High' : 'Low'} /><Summary label="Affected Shipments" value={String(submitted.affectedShipments)} /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => navigate(`/alerts?alert=${encodeURIComponent(submitted.alertId)}`)}>View Alert</Button><Button variant="ghost" onClick={() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>View on Map</Button><Button variant="accent" onClick={() => navigate(`/plan-route?from=${encodeURIComponent(submittedSegment?.from ?? '')}&to=${encodeURIComponent(submittedSegment?.to ?? '')}&cargo=medicine&exclude=${encodeURIComponent(submitted.segmentId ?? '')}&report=${encodeURIComponent(submitted.reportId)}`)}>Find Alternative Route</Button></div>
          </Card>
        )}

        {/* gamification */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Award size={16} className="text-accent" /> {t('report.gamified')}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
            <Pill tone="blue">🏅 {t('report.badgeFirst')}</Pill>
            <Pill tone="green">👁️ {t('report.badgeVerified')}</Pill>
            <Pill tone="orange">🦸 {t('report.badgeHero')}</Pill>
          </div>
          {user?.role === 'citizen' && (
            <div className="mt-2 text-[12px] text-slate-600">{t('auth.welcome')}, {user.name} — <strong className="text-primary">{user.points ?? 0} pts</strong></div>
          )}
        </Card>

        {/* my reports */}
        <Card className="p-4">
          <div className="font-bold text-sm text-slate-800 mb-2">{t('report.myReports')}</div>
          {!myReports.length ? (
            <EmptyState icon={<Camera size={18} />} title="No reports yet" body="Incidents you report will show up here, along with their verification status." />
          ) : (
          <div className="space-y-2">
            {myReports.map(r => (
              <div key={r.id} className="border border-slate-100 rounded-lg p-2.5 text-[12px] transition-colors hover:border-slate-200 hover:bg-slate-50/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">{r.type} · {r.severity}</span>
                  {statusPill(r.status)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{r.description}</div>
                {/* real uploaded photo — a verifying official opens the image */}
                {r.photoUrl && (
                  <a href={mediaUrl(r.photoUrl)} target="_blank" rel="noreferrer"
                    className="mt-1.5 flex items-center gap-2 group">
                    <img
                      src={mediaUrl(r.photoUrl)}
                      alt={r.photoName ?? `photo for ${r.id}`}
                      loading="lazy"
                      className="h-14 w-20 object-cover rounded-md border border-slate-200 group-hover:border-primary"
                    />
                    <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                      <ExternalLink size={10} /> View photo
                      {r.photoSeverity && <span className="text-slate-400 font-semibold">· AI read: {SEVERITY_LABEL[r.photoSeverity]}</span>}
                    </span>
                  </a>
                )}
                {r.photoName && !r.photoUrl && (
                  <div className="text-[10px] text-slate-400 mt-1.5">📷 {r.photoName} <em>(filename only — photo not uploaded)</em></div>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-slate-400">{timeAgo(r.createdAt)} · {r.reporter}</span>
                  {!r.synced && <Pill tone="orange"><WifiOff size={10} /> queued</Pill>}
                  {r.synced && r.points > 0 && <Pill tone="green">+{r.points} pts</Pill>}
                </div>
                {/* trust indicator */}
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{t('report.trust')}</span>
                    <span>{(r.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${r.confidence * 100}%`,
                      background: r.confidence > 0.7 ? '#2E9E5B' : r.confidence > 0.4 ? '#E0A929' : '#D64545',
                    }} />
                  </div>
                </div>
                {isOfficial && r.status === 'pending' && (
                  <div className="flex gap-2 mt-2">
                    <Button variant="primary" className="!bg-success text-[11px] py-1 flex-1" disabled={verifyingId === r.id} onClick={() => handleVerify(r.id, true)}>
                      <CheckCircle2 size={12} /> {verifyingId === r.id ? 'Verifying…' : 'Verify'}
                    </Button>
                    <Button variant="ghost" className="text-[11px] py-1 flex-1" disabled={verifyingId === r.id} onClick={() => handleVerify(r.id, false)}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </Card>
      </div>

      <div ref={mapRef} className="relative min-h-[420px] lg:min-h-full">
        <MapView
          layers={{ roads: true, incidents: true, reports: true, alerts: false, facilities: false }}
          onPick={(lat, lng) => setPin([lat, lng])}
          focus={pin} focusZoom={pin ? 11 : undefined}
          currentLocation={pin}
        />
        {pin && (
          <div className="absolute z-[600] pointer-events-none" style={{ left: '50%', top: '50%' }}>
            <div className="marker-pin bg-accent" style={{ transform: 'translate(-50%, -100%) rotate(-45deg)' }}>
              <MapPin size={14} />
            </div>
          </div>
        )}
        <div className="absolute top-3 left-3 z-[500] bg-white/95 rounded-lg shadow-card px-3 py-2 text-[11px] font-semibold text-slate-600">
          {t('report.pinOnMap')}
        </div>
      </div>
    </div>
  )
}
