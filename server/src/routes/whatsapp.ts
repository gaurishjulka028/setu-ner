// WhatsApp surface (Feature 4).
//
// * GET  /api/whatsapp/status  — transport (meta | twilio | simulated), sender id
// * GET  /api/whatsapp/outbox  — recent dispatched messages (demo UI)
// * POST /api/whatsapp/webhook — inbound messages. Accepts all three shapes:
//     - Twilio (form-encoded From/Body)            → replies TwiML
//     - Meta Cloud API (JSON entry[].changes[]...) → replies over the API, 200 {}
//     - plain JSON { Body } from the app/curl      → replies JSON
//   Understands "TRACK <bookingId>" (also STATUS / WHERE IS) and answers
//   straight from booking data.
// * GET  /api/whatsapp/webhook — Meta's one-time webhook verification
//   handshake (hub.mode / hub.verify_token / hub.challenge).
import { Router, urlencoded } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { waTransport, waEnabled, waOutbox, dispatcherNumber, dispatchWhatsApp, normalizeWaNumber, metaVerifyToken, waConfig, markWaDelivery } from '../lib/whatsapp'
import { DISTRICTS } from '../data/ner'
import { getVehicle } from '../engine/vehicles'

const router = Router()
// Twilio posts webhooks as application/x-www-form-urlencoded — parse it on
// this router only (the rest of the API is JSON by design).
router.use(urlencoded({ extended: true }))

const trackSchema = z.object({
  From: z.string().optional(),
  To: z.string().optional(),
  Body: z.string().optional(),
})

const districtName = (id: string) => {
  const d = DISTRICTS.find(x => x.id === id)
  return d?.hq ? `${d.hq} (${d.name})` : id
}

// ── TRACK <bookingId> answer builder — shared by TwiML + JSON paths ───────
async function answerTrack(raw: string): Promise<{ text: string; booking?: unknown }> {
  const trimmed = raw.trim()
  // ids look like "B-abc123-defg" (prefix upper, tail lower) and people type
  // them in any case — SQLite LIKE is case-insensitive, so pull candidates
  // by prefix and filter for the exact case-insensitive id.
  const candidates = await prisma.booking.findMany({ where: { id: { startsWith: trimmed.slice(0, 3) } }, take: 10 })
  const booking = candidates.find(b => b.id.toLowerCase() === trimmed.toLowerCase())
  if (booking) return buildTrackReply(booking)
  const id = trimmed.toUpperCase()
  const matches = await prisma.booking.findMany({ where: { id: { startsWith: id } }, take: 3 })
  if (!matches.length) {
    return { text: `SETU-NER: no booking found for "${trimmed}". Please send TRACK followed by the full booking id (e.g. TRACK B-mz1x2-3k4l).\nDemo: any id on the Bookings screen works.` }
  }
  return { text: `SETU-NER: no exact match for "${trimmed}". Did you mean one of?\n${matches.map(b => b.id).join('\n')}\nReply TRACK <full id> for live status.` }
}

async function buildTrackReply(booking: {
  id: string; cargo: string; weightT: number; fromDistrict: string; toDistrict: string; status: string
  shipper: string; communityCarrier: string | null; warehouseOut: boolean | null; depotReached: boolean | null
  villageReceived: boolean | null; createdAt: number
}): Promise<{ text: string; booking?: unknown }> {
  const statusMap: Record<string, string> = {
    requested: 'requested — carrier matching in progress',
    assigned: 'assigned — vehicle allocated, awaiting dispatch',
    in_transit: 'in transit',
    delivered: 'delivered ✓',
  }
  const fromName = districtName(booking.fromDistrict)
  const toName = districtName(booking.toDistrict)
  const cargoLabel: Record<string, string> = {
    medicine: 'Medicine', food: 'Food grains', fuel: 'Fuel', construction: 'Construction material',
    agri: 'Agricultural produce', relief: 'Relief supplies', pharma: 'Pharma / vaccines',
  }
  const t = new Date(booking.createdAt)
  const when = `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  const stages = [
    booking.warehouseOut ? '✓ left warehouse' : '○ warehouse',
    booking.depotReached ? '✓ at depot' : '○ depot',
    booking.villageReceived ? '✓ village received' : '○ village',
  ].join(' · ')
  const v = (booking as { vehicleId?: string | null }).vehicleId ? getVehicle((booking as { vehicleId?: string | null }).vehicleId!) : undefined
  const liveLine = v
    ? `📍 ${v.telemetry === 'gps' ? 'GPS' : 'sim'} ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} · ${v.status}${v.etaHours != null ? ` · ETA ~${v.etaHours}h` : ''}${v.remainingKm != null ? ` · ${v.remainingKm} km left` : ''}\nhttps://maps.google.com/?q=${v.lat.toFixed(5)},${v.lng.toFixed(5)}\n`
    : ''
  const text =
    `SETU-NER tracking: ${booking.id}\n` +
    `${cargoLabel[booking.cargo] ?? booking.cargo} · ${booking.weightT}t\n` +
    `${fromName} → ${toName}\n` +
    `Status: ${statusMap[booking.status] ?? booking.status}\n` +
    `${stages}\n` +
    liveLine +
    `Booked ${when} by ${booking.shipper}${booking.communityCarrier ? ` · last-mile: ${booking.communityCarrier}` : ''}\n` +
    `— reply HELP for commands`
  return { text, booking }
}

// Meta webhook verification handshake: when you paste the callback URL into
// the Meta app dashboard it GETs this with hub.verify_token; we must echo
// hub.challenge back as plain text if the token matches META_WA_VERIFY_TOKEN.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token === metaVerifyToken() && typeof challenge === 'string') {
    return res.status(200).type('text/plain').send(challenge)
  }
  res.status(403).json({ error: 'verify token mismatch' })
})

async function replyFor(body: string): Promise<{ text: string; booking?: unknown }> {
  const trimmed = body.trim()
  if (!trimmed || /^(HELP|START|STOP|MENU|HI|HELLO)$/i.test(trimmed)) {
    return { text: 'SETU-NER WhatsApp assistant\nCommands:\n• TRACK <booking id> — live booking status + map link\n• HELP — this message' }
  }
  const m = trimmed.match(/^(?:TRACK|STATUS|WHERE IS)\s+(.+)$/i) ?? (/^[A-Z]{1,4}-[\w-]+$/i.test(trimmed) ? [trimmed, trimmed] : null)
  if (!m) {
    return { text: 'SETU-NER: I understand "TRACK <bookingId>" (and HELP). Try e.g. TRACK B-mz1x2-3k4l — ids appear on the Bookings screen.' }
  }
  return answerTrack(m[1])
}

// Inbound webhook (unauthenticated by design — Twilio signs real traffic and
// Meta verifies the URL once; the demo validates nothing beyond a Body and
// only ever reads bookings/vehicle positions).
router.post('/webhook', async (req, res) => {
  const ct = req.headers['content-type'] ?? ''
  const isForm = ct.includes('x-www-form-urlencoded')
  const raw = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body ?? {})

  // ── Meta Cloud API shape ────────────────────────────────────────────────
  if (raw && raw.object === 'whatsapp_business_account' && Array.isArray(raw.entry)) {
    const msgs: { from: string; text?: { body?: string }; type?: string }[] = []
    for (const e of raw.entry) for (const c of e.changes ?? []) for (const m of c.value?.messages ?? []) msgs.push(m)
    // Meta expects a fast 200; reply asynchronously over the send API.
    res.status(200).json({ received: msgs.length })
    for (const m of msgs) {
      if (m.type !== 'text' || !m.text?.body) continue
      const { text } = await replyFor(m.text.body)
      dispatchWhatsApp(m.from, text).catch(() => {})
    }
    return
  }

  // ── Twilio (form) / plain JSON shape ────────────────────────────────────
  const parsed = trackSchema.safeParse(raw)
  const body = (parsed.success ? parsed.data.Body : undefined) ?? (typeof raw.body === 'string' ? raw.body : '') ?? ''
  const wantsXml = (req.headers.accept ?? '').includes('xml') || isForm
  const { text, booking } = await replyFor(body)
  if (wantsXml) return res.type('text/xml').send(twiml(text))
  return res.json({ reply: text, booking: booking ?? undefined })
})

// Optional: a browser-callable "send" endpoint for the requisition / SOS /
// dispatcher flows. Restricted to the roles whose pages can send (company
// consoles, driver SOS, official dashboards). Awaits the dispatch so the UI
// learns the REAL outcome (sent / failed + provider reason) instead of
// assuming success.
router.post('/send', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), async (req, res) => {
  const parsed = z.object({ to: z.string().min(1), body: z.string().min(1).max(4000) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'to and body are required' })
  // "dispatcher" = the configured WHATSAPP_DISPATCHER_TO number (or the
  // simulated default), so the UI never has to know a phone number.
  const to = parsed.data.to === 'dispatcher' ? dispatcherNumber() : normalizeWaNumber(parsed.data.to)
  if (to.length < 10) return res.status(400).json({ error: 'to must be a phone number or "dispatcher"' })
  const message = await dispatchWhatsApp(to, parsed.data.body)
  res.json({
    ok: message.status !== 'failed',
    id: message.id,
    to: message.to,
    transport: waTransport(),
    simulated: !waEnabled(),
    status: message.status,
    viaTemplate: message.viaTemplate ?? false,
    // What actually reached the phone (only differs on a template fallback).
    deliveredBody: message.deliveredBody ?? message.body,
    error: message.error,
  })
})

// Dispatch internals (transport config + outbox with message bodies and
// phone numbers) — operational roles only. The webhook and status-callback
// routes stay open by design: providers (Twilio/Meta) call them.
router.get('/status', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), (_req, res) => {
  res.json({
    ...waConfig(),
    webhook: '/api/whatsapp/webhook',
    commands: ['TRACK <bookingId>', 'HELP'],
  })
})

router.get('/outbox', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), (_req, res) => {
  res.json(waOutbox().slice(0, 40))
})

// Twilio delivery receipts. Set TWILIO_STATUS_CALLBACK_URL to
// https://<public-host>/api/whatsapp/status-callback and Twilio POSTs
// MessageSid + MessageStatus (sent → delivered → read, or failed/undelivered)
// here for every outbound message. We fold each receipt into the outbox,
// and the change-listener pushes the updated state to every client via
// 'whatsapp:status' — so "delivered" / "read" appear live in the UI.
router.post('/status-callback', (req, res) => {
  const raw = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body ?? {})
  const sid = raw.MessageSid as string | undefined
  const status = String(raw.MessageStatus ?? '')
  if (sid) {
    const mapped: 'sent' | 'delivered' | 'read' | 'failed' | 'undelivered' | null =
      status === 'delivered' ? 'delivered'
        : status === 'read' ? 'read'
          : status === 'failed' ? 'failed'
            : status === 'undelivered' ? 'undelivered'
              : status === 'sent' ? 'sent' : null
    if (mapped) markWaDelivery(sid, mapped)
  }
  // Twilio ignores the body; a fast empty 200 is all it wants.
  res.sendStatus(200)
})

function twiml(text: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(text)}</Message></Response>`
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '\n')
}

export default router
