import { useEffect, useState } from 'react'
import { MessageCircle, RefreshCw } from 'lucide-react'
import { Card, SectionTitle, Pill, EmptyState, RowSkeleton } from './ui'
import { api } from '../lib/api'
import { getVehicleSocket } from '../lib/socket'
import { timeAgo } from '../lib/format'

interface WaStatusPayload {
  transport?: 'meta' | 'twilio' | 'simulated'
  live?: boolean
  provider?: string
  from?: string | null
  dispatcherTo?: string | null
  statusCallback?: string | null
  outbox?: WaMessage[]
}
interface WaMessage {
  id: string
  to: string
  body: string
  transport: 'meta' | 'twilio' | 'simulated'
  at: number
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'undelivered'
  providerId?: string
  error?: string
  /** True when a Twilio content template had to carry the message (24-h window). */
  viaTemplate?: boolean
  /** The text that ACTUALLY reached the phone when it differs from `body`. */
  deliveredBody?: string
}

const STATUS_META: Record<WaMessage['status'], { tone: 'red' | 'green' | 'blue' | 'amber'; label: string }> = {
  queued: { tone: 'amber', label: 'queued' },
  sent: { tone: 'blue', label: 'sent' },
  delivered: { tone: 'green', label: 'delivered' },
  read: { tone: 'green', label: 'read ✓' },
  failed: { tone: 'red', label: 'failed' },
  undelivered: { tone: 'red', label: 'undelivered' },
}

/**
 * Live WhatsApp dispatch panel — transport state + the outbox, updated in
 * real time over the 'whatsapp:status' socket push (initial state comes
 * from GET /api/whatsapp/status + /outbox, then the socket takes over).
 */
export default function WhatsAppPanel() {
  const [status, setStatus] = useState<WaStatusPayload | null>(null)
  const [outbox, setOutbox] = useState<WaMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Initial paint (also covers the "socket not connected yet" moment).
    Promise.allSettled([api.get<WaStatusPayload>('/api/whatsapp/status'), api.get<WaMessage[]>('/api/whatsapp/outbox')])
      .then(([s, o]) => {
        if (cancelled) return
        if (s.status === 'fulfilled') setStatus(s.value)
        if (o.status === 'fulfilled') setOutbox(o.value)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    const socket = getVehicleSocket()
    const onUpdate = (p: WaStatusPayload) => {
      setStatus(prev => ({ ...prev, ...p, outbox: undefined }))
      if (p.outbox) setOutbox(p.outbox)
    }
    socket.on('whatsapp:status', onUpdate)
    return () => { cancelled = true; socket.off('whatsapp:status', onUpdate) }
  }, [])

  const live = status?.live ?? false
  const transport = status?.transport ?? 'simulated'

  return (
    <Card className="p-4">
      <SectionTitle
        icon={<MessageCircle size={17} />}
        title="WhatsApp dispatch"
        sub="Outbound messages, with live delivery receipts"
        right={<Pill tone={live ? 'green' : 'amber'}>{live ? `LIVE · ${transport}` : transport === 'simulated' ? 'SIMULATED' : `configured · ${transport}`}</Pill>}
      />
      {!live && (
        <p className="mt-1 text-[11px] text-slate-500">
          {transport === 'simulated'
            ? 'Simulation mode active — WhatsApp messages are recorded as successful in the demo outbox and are not sent to a real phone.'
            : `Transport "${transport}" is configured but not marked live yet.`}
          {status?.statusCallback
            ? ` Delivery receipts → ${status.statusCallback}`
            : ' Delivery receipts are off (set TWILIO_STATUS_CALLBACK_URL for real-time delivered/read states).'}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <><RowSkeleton lines={2} /><RowSkeleton lines={2} /></>
        ) : outbox.length === 0 ? (
          <EmptyState icon={<RefreshCw size={18} />} title="No messages yet" body="Send the dashboard requisition, create a booking, or raise a high-severity alert — it appears here instantly." />
        ) : (
          outbox.slice(0, 12).map(m => {
            const meta = STATUS_META[m.status] ?? STATUS_META.sent
            const shownBody = m.deliveredBody && m.deliveredBody !== m.body ? m.deliveredBody : m.body
            return (
              <div key={m.id} className="flex gap-2.5 rounded-lg border border-slate-100 p-2.5 hover:border-slate-200 hover:bg-slate-50/60">
                <Pill tone={meta.tone}>{meta.label}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-slate-600">→ {m.to} <span className="font-normal text-slate-400">· {timeAgo(m.at)}</span>
                    {m.viaTemplate && <span className="ml-1.5 font-bold text-accent">· via template</span>}
                  </div>
                  <div className={`line-clamp-2 whitespace-pre-line text-[11px] ${m.deliveredBody && m.deliveredBody !== m.body ? 'text-accent' : 'text-slate-600'}`}>{shownBody}</div>
                  {m.deliveredBody && m.deliveredBody !== m.body && (
                    <div className="text-[10px] text-slate-400 mt-0.5">Template fallback — the drafted text is shown in accent above ONLY if the template contains it; verify the wording matches before relying on it.</div>
                  )}
                  {m.error && <div className="text-[10px] font-semibold text-hazard mt-0.5 leading-relaxed">⚠ {m.error}</div>}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
