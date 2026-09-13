// WhatsApp dispatch (Feature 4).
//
// Three transports, picked from the environment at boot (see .env.example):
//
//   meta       Meta WhatsApp Cloud API (the official Business Platform).
//              WHATSAPP_PROVIDER=meta + META_WA_TOKEN + META_WA_PHONE_NUMBER_ID.
//              Free test number from developers.facebook.com → your app →
//              WhatsApp → API Setup. Production-grade, no per-message middleman.
//
//   twilio     Twilio's WhatsApp sandbox / sender. TWILIO_ACCOUNT_SID +
//              TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM. Fastest for a demo:
//              join the sandbox by sending the join code from your phone.
//
//   simulated  Neither configured → messages are logged to the console and
//              kept in an in-memory outbox (GET /api/whatsapp/outbox) so the
//              whole report → booking → alert → webhook flow stays demoable
//              without credentials or internet.
//
// Credentials only ever come from the environment; nothing is hard-coded.

export type WaTransport = 'meta' | 'twilio' | 'msg91' | 'simulated'

const env = (k: string) => (process.env[k] ?? '').trim() || undefined

const cfg = {
  provider: (env('WHATSAPP_PROVIDER') ?? '').toLowerCase(),
  // Twilio
  accountSid: env('TWILIO_ACCOUNT_SID'),
  authToken: env('TWILIO_AUTH_TOKEN'),
  from: env('TWILIO_WHATSAPP_FROM'), // e.g. "whatsapp:+14155238886"
  // Optional Twilio Content API template (WhatsApp). Needed to message
  // someone who hasn't messaged your sender in the last 24 h.
  contentSid: env('TWILIO_WHATSAPP_CONTENT_SID'),
  // Overridable so the Twilio path can be exercised against a local mock
  // (same convention as OSRM_URL / STADIA_ROUTING_URL / VISION_BASE_URL).
  twilioBase: (env('TWILIO_API_BASE') ?? 'https://api.twilio.com').replace(/\/+$/, ''),
  // MSG91 WhatsApp Cloud API
  msg91AuthKey: env('MSG91_AUTH_KEY'),
  msg91IntegratedNumber: env('MSG91_INTEGRATED_NUMBER'),
  msg91Base: (env('MSG91_WHATSAPP_API_BASE') ?? 'https://api.msg91.com/api/v5/whatsapp').replace(/\/+$/, ''),
  msg91AlertTemplate: env('MSG91_WHATSAPP_ALERT_TEMPLATE'),
  msg91AlertNamespace: env('MSG91_WHATSAPP_ALERT_NAMESPACE'),
  msg91AlertLanguage: env('MSG91_WHATSAPP_ALERT_LANGUAGE') ?? 'en',
  msg91OtpTemplate: env('MSG91_WHATSAPP_OTP_TEMPLATE'),
  msg91OtpNamespace: env('MSG91_WHATSAPP_OTP_NAMESPACE'),
  msg91OtpLanguage: env('MSG91_WHATSAPP_OTP_LANGUAGE') ?? 'en',
  msg91OtpButton: (env('MSG91_WHATSAPP_OTP_BUTTON') ?? 'true').toLowerCase() === 'true',
  // Meta Cloud API
  metaToken: env('META_WA_TOKEN'),
  metaPhoneId: env('META_WA_PHONE_NUMBER_ID'),
  metaVersion: env('META_WA_API_VERSION') ?? 'v25.0',
  metaVerifyToken: env('META_WA_VERIFY_TOKEN') ?? 'setu-ner-verify',
  metaOtpTemplate: env('META_WA_OTP_TEMPLATE_NAME'),
  metaOtpLanguage: env('META_WA_OTP_TEMPLATE_LANGUAGE') ?? 'en_US',
  metaUtilityTemplate: env('META_WA_UTILITY_TEMPLATE_NAME'),
  metaUtilityLanguage: env('META_WA_UTILITY_TEMPLATE_LANGUAGE') ?? 'en_US',
}

const twilioReady = () => Boolean(cfg.accountSid && cfg.authToken && cfg.from)
const msg91Ready = () => Boolean(cfg.msg91AuthKey && cfg.msg91IntegratedNumber)
const metaReady = () => Boolean(cfg.metaToken && cfg.metaPhoneId)

export const waTransport = (): WaTransport => {
  if (cfg.provider === 'meta' && metaReady()) return 'meta'
  if (cfg.provider === 'twilio' && twilioReady()) return 'twilio'
  if (cfg.provider === 'msg91' && msg91Ready()) return 'msg91'
  if (cfg.provider === 'simulated' || cfg.provider === 'off') return 'simulated'
  // Auto-detect when WHATSAPP_PROVIDER isn't set.
  if (metaReady()) return 'meta'
  if (twilioReady()) return 'twilio'
  if (msg91Ready()) return 'msg91'
  return 'simulated'
}

export const waEnabled = () => waTransport() !== 'simulated'
export const metaVerifyToken = () => cfg.metaVerifyToken

// Default demo dispatcher number (used when WHATSAPP_DISPATCHER_TO is unset).
export const dispatcherNumber = () => env('WHATSAPP_DISPATCHER_TO') || '919999999999'

/** "+91 99580 12345" / "whatsapp:+919958012345" / "9958012345" → E.164 digits (no +). */
export function normalizeWaNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits // already E.164 (country code included)
}

export interface WaMessage {
  id: string
  to: string
  /** What the app drafted — what the UI (WhatsAppPanel) shows. */
  body: string
  transport: WaTransport
  at: number
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'undelivered'
  providerId?: string
  error?: string
  /** Set when Twilio refused the free-form message and a content template was used instead. */
  viaTemplate?: boolean
  /**
   * The text the provider ACTUALLY delivered. Normally identical to `body`;
   * only a template fallback renders something different — and then the UI
   * shows this instead of pretending the draft went out unchanged.
   */
  deliveredBody?: string
}

// In-memory outbox (last 60). Enough for a demo; production would persist
// this. Delivery receipts (sent → delivered → read, or failed/undelivered)
// arrive via Twilio's StatusCallback → POST /api/whatsapp/status-callback →
// markWaDelivery(), so the UI can follow a message in real time.
const outbox: WaMessage[] = []
let onChange: (() => void) | null = null
// Real-time hook: registered by realtime.ts so every outbox change is pushed
// to all connected clients as 'whatsapp:status' (no import cycle — the lib
// only calls a callback, it never touches socket.io itself).
export function setWaChangeListener(fn: (() => void) | null) { onChange = fn }
const remember = (m: WaMessage) => { outbox.push(m); if (outbox.length > 60) outbox.shift(); onChange?.(); return m }

/** Updates a message by provider id (Twilio MessageSid) when a status
 *  callback lands; returns the updated message or undefined if unknown. */
export function markWaDelivery(providerId: string, status: WaMessage['status']): WaMessage | undefined {
  const m = outbox.find(x => x.providerId === providerId)
  if (!m) return undefined
  m.status = status
  onChange?.()
  return m
}

export const waOutbox = (): WaMessage[] => [...outbox].reverse()

// Twilio accepts EITHER a free-form `Body` OR a Content API `ContentSid` in a
// request, never both — sending both is rejected outright.
async function postTwilio(form: URLSearchParams): Promise<{ ok: boolean; sid?: string; message?: string; code?: number }> {
  const url = `${cfg.twilioBase}/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`
  const basic = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(15_000),
  })
  const json = await resp.json().catch(() => ({})) as { sid?: string; message?: string; code?: number }
  if (!resp.ok) return { ok: false, message: json.message ?? `${resp.status}`, code: json.code }
  return { ok: true, sid: json.sid }
}

// Content templates fill {{1}}, {{2}}… slots. The whole composed message goes
// into {{1}} by default. Override with TWILIO_CONTENT_VARIABLES as a JSON
// object of slot → literal, where the token {{body}} is substituted with the
// message. e.g.  {"1":"{{body}}","2":"SETU-NER"}
function twilioContentVariables(body: string): Record<string, string> {
  const raw = env('TWILIO_CONTENT_VARIABLES')
  if (!raw) return { '1': body }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [slot, value] of Object.entries(parsed)) out[slot] = String(value).split('{{body}}').join(body)
    return out
  } catch {
    console.warn('[whatsapp] TWILIO_CONTENT_VARIABLES is not valid JSON — falling back to {"1": <message>}')
    return { '1': body }
  }
}

// ── Content-template fallback (opt-in, and HONEST about what it sends) ─────
//
// Meta's 24-hour customer-service window still applies underneath Twilio: a
// free-form `Body` to someone who hasn't messaged your sender in the last
// 24 h is refused (Twilio error 63016, "re-engagement message required"),
// and only a pre-approved template gets through.
//
// Previously the fallback fired whenever TWILIO_WHATSAPP_CONTENT_SID was set
// — and because Twilio's sandbox suggests its built-in SAMPLE template
// ("Reminder: Appt … Reply C to confirm or R to reschedule"), recipients got
// that unrelated reminder while the UI kept showing the drafted emergency
// requisition. The fallback is now only allowed when the operator ALSO sets
// TWILIO_WHATSAPP_TEMPLATE_BODY to the template's exact body pattern (with a
// {{body}} placeholder), so that:
//   • the rendered text provably contains the drafted message, and
//   • the outbox/UI can show the true delivered text instead of the draft.
// Without it, a refused free-form send FAILS LOUDLY with instructions — it
// never silently sends unrelated content.
const BODY_PLACEHOLDER = '{{body}}'
const templateBodyPattern = () => {
  const raw = env('TWILIO_WHATSAPP_TEMPLATE_BODY')
  // A pattern without the placeholder can't actually carry the drafted
  // message — treat it as unconfigured so the loud "missing template"
  // error fires instead of silently sending the pattern text verbatim.
  return raw && raw.includes(BODY_PLACEHOLDER) ? raw : undefined
}

/** What the template will actually render on the recipient's phone. */
function renderTemplateBody(body: string): string {
  const pattern = templateBodyPattern()
  return pattern ? pattern.split('{{body}}').join(body) : body
}

// Boot-time guard: a ContentSid WITHOUT a *working* body pattern (missing
// entirely, OR present but missing the {{body}} placeholder — the state
// that silently sent Twilio's SAMPLE template body unchanged, discarding
// the actual drafted message) is the exact configuration that delivered
// "Reminder: Appt Tue Oct 29, 3:00 PM…" to recipients instead of the app's
// own message. The runtime fallback refuses to use it (see deliverTwilio)
// — this warning explains why at startup, where the operator is looking.
if (cfg.contentSid && !templateBodyPattern()) {
  const rawBody = env('TWILIO_WHATSAPP_TEMPLATE_BODY')
  const reason = !rawBody
    ? 'TWILIO_WHATSAPP_TEMPLATE_BODY is NOT set'
    : `TWILIO_WHATSAPP_TEMPLATE_BODY is set but does NOT contain the ${BODY_PLACEHOLDER} placeholder, so it can't actually carry your message (it would go out as literally "${rawBody.slice(0, 80)}")`
  console.warn(
    `[whatsapp] TWILIO_WHATSAPP_CONTENT_SID is set (${cfg.contentSid}) but ${reason}.\n` +
    `[whatsapp] If that ContentSid is Twilio's SAMPLE template, its fallback is disabled on purpose — it previously delivered\n` +
    `[whatsapp] "Reminder: Appt Tue Oct 29, 3:00 PM. Reply C to confirm or R to reschedule. Test message from Twilio." instead of your message.\n` +
    `[whatsapp] Either REMOVE TWILIO_WHATSAPP_CONTENT_SID (free-form messages deliver the exact drafted text to anyone inside the 24-hour window —\n` +
    `[whatsapp] have recipients reply once to open it), or set TWILIO_WHATSAPP_TEMPLATE_BODY to your APPROVED template's exact body text containing a ${BODY_PLACEHOLDER} placeholder, e.g. "SETU-NER emergency message:\\n${BODY_PLACEHOLDER}".`,
  )
}

// Twilio error 63016 = "re-engagement message required" (24-h window closed).
function isReEngagementRefusal(code: number | undefined, message: string | undefined): boolean {
  if (code === 63016) return true
  return /re-engagement|24 hour|24-hour window/i.test(message ?? '')
}

async function deliverTwilio(to: string, body: string): Promise<{ sid?: string; viaTemplate?: boolean; deliveredBody?: string }> {
  const dest = `whatsapp:+${normalizeWaNumber(to)}`
  const from = cfg.from!
  // Absolute URL Twilio POSTs delivery receipts to (MessageStatus). Unset
  // → no StatusCallback param, preserving the plain fire-and-forget behaviour.
  const statusCallback = env('TWILIO_STATUS_CALLBACK_URL')
  const withCb = (form: URLSearchParams) => { if (statusCallback) form.set('StatusCallback', statusCallback); return form }

  // Attempt 1 — the free-form message. This is exactly what the UI drafted,
  // and the right thing whenever the recipient messaged us inside the last
  // 24 h (which includes every sandbox that has joined the conversation).
  const freeform = await postTwilio(withCb(new URLSearchParams({ To: dest, From: from, Body: body })))
  if (freeform.ok) return { sid: freeform.sid }

  // Refused because the recipient went cold → only a verified template may carry it.
  if (isReEngagementRefusal(freeform.code, freeform.message)) {
    if (!cfg.contentSid || !templateBodyPattern()) {
      const missing = !cfg.contentSid
        ? 'no WhatsApp content template is configured (TWILIO_WHATSAPP_CONTENT_SID)'
        : `TWILIO_WHATSAPP_CONTENT_SID is set but TWILIO_WHATSAPP_TEMPLATE_BODY is missing or doesn't contain the ${BODY_PLACEHOLDER} placeholder, so the server cannot verify the template actually carries your message (a template body without that placeholder previously delivered Twilio's sample "Reminder: Appt…" template instead of the drafted text)`
      throw new Error(
        `WhatsApp could not deliver the message: the recipient hasn't messaged this sender in the last 24 hours, and WhatsApp only delivers free-form text inside that window. `
        + `Fastest fix: have the recipient send ANY WhatsApp reply (e.g. "start") to the SETU-NER sender, then resend — the window reopens instantly. `
        + `To reach cold recipients, configure an approved content template: ${missing}. `
        + `(Twilio said: ${freeform.message})`,
      )
    }
    const form = new URLSearchParams({ To: dest, From: from, ContentSid: cfg.contentSid })
    const vars = twilioContentVariables(body)
    if (Object.keys(vars).length) form.set('ContentVariables', JSON.stringify(vars))
    const templated = await postTwilio(withCb(form))
    if (!templated.ok) {
      throw new Error(`twilio template ${cfg.contentSid}: ${templated.message} (free-form also failed: ${freeform.message})`)
    }
    const deliveredBody = renderTemplateBody(body)
    console.log(`[whatsapp:twilio] free-form refused (${String(freeform.message).slice(0, 90)}) — delivered via template ${cfg.contentSid}`)
    return { sid: templated.sid, viaTemplate: true, deliveredBody }
  }

  // Any other refusal is a real failure — surface it truthfully.
  throw new Error(`twilio: ${freeform.message ?? 'message rejected'}`)
}

async function postMsg91Template(to: string, templateName: string, namespace: string | undefined, language: string, values: string[], includeOtpButton = false): Promise<{ id?: string }> {
  if (!cfg.msg91AuthKey || !cfg.msg91IntegratedNumber) throw new Error('MSG91 WhatsApp is not configured: set MSG91_AUTH_KEY and MSG91_INTEGRATED_NUMBER.')
  if (!templateName) throw new Error('MSG91 WhatsApp template is not configured.')
  const components: Record<string, unknown> = {}
  values.forEach((value, index) => { components[`body_${index + 1}`] = { type: 'text', value } })
  if (includeOtpButton && values[0]) components.button_1 = { type: 'text', subtype: 'url', value: values[0] }
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: language, policy: 'deterministic' },
    to_and_components: [{ to: [normalizeWaNumber(to)], components }],
  }
  if (namespace) template.namespace = namespace
  const resp = await fetch(`${cfg.msg91Base}/whatsapp-outbound-message/bulk/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: cfg.msg91AuthKey },
    body: JSON.stringify({
      integrated_number: normalizeWaNumber(cfg.msg91IntegratedNumber),
      content_type: 'template',
      payload: { messaging_product: 'whatsapp', type: 'template', template },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await resp.json().catch(() => ({})) as { message_id?: string; message?: string; type?: string; status?: string }
  if (!resp.ok) throw new Error(`MSG91 ${resp.status}: ${json.message ?? JSON.stringify(json).slice(0, 300)}`)
  return { id: json.message_id }
}

async function deliverMsg91(to: string, body: string): Promise<{ sid?: string; viaTemplate: boolean; deliveredBody: string }> {
  if (!cfg.msg91AlertTemplate) throw new Error('MSG91 alert template is not configured: set MSG91_WHATSAPP_ALERT_TEMPLATE.')
  const r = await postMsg91Template(to, cfg.msg91AlertTemplate, cfg.msg91AlertNamespace, cfg.msg91AlertLanguage, [body])
  return { sid: r.id, viaTemplate: true, deliveredBody: body }
}

export async function sendMsg91WhatsAppOtp(to: string, code: string): Promise<void> {
  if (waTransport() !== 'msg91') throw new Error('MSG91 WhatsApp transport is not active.')
  if (!cfg.msg91OtpTemplate) throw new Error('MSG91 OTP template is not configured: set MSG91_WHATSAPP_OTP_TEMPLATE.')
  await postMsg91Template(to, cfg.msg91OtpTemplate, cfg.msg91OtpNamespace, cfg.msg91OtpLanguage, [code], cfg.msg91OtpButton)
}

async function postMeta(payload: Record<string, unknown>): Promise<string | undefined> {
  const url = `https://graph.facebook.com/${cfg.metaVersion}/${cfg.metaPhoneId}/messages`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.metaToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await resp.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string; code?: number } }
  if (!resp.ok) throw new Error(`meta ${resp.status}: ${json.error?.message ?? JSON.stringify(json).slice(0, 300)}`)
  return json.messages?.[0]?.id
}

async function deliverMeta(to: string, body: string): Promise<string | undefined> {
  // Business-initiated messages outside the 24-hour customer-service window
  // must use an approved template. If a utility template is configured, use
  // it for alerts/dispatch messages; otherwise fall back to free-form text so
  // the same code also works during an active user conversation.
  if (cfg.metaUtilityTemplate) {
    return postMeta({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeWaNumber(to),
      type: 'template',
      template: {
        name: cfg.metaUtilityTemplate,
        language: { code: cfg.metaUtilityLanguage },
        components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }],
      },
    })
  }
  return postMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaNumber(to),
    type: 'text',
    text: { preview_url: false, body },
  })
}

export async function sendMetaWhatsAppOtp(to: string, code: string): Promise<void> {
  if (waTransport() !== 'meta') throw new Error('Meta WhatsApp transport is not active.')
  if (!cfg.metaOtpTemplate) throw new Error('Meta WhatsApp OTP template is not configured: set META_WA_OTP_TEMPLATE_NAME.')
  await postMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaNumber(to),
    type: 'template',
    template: {
      name: cfg.metaOtpTemplate,
      language: { code: cfg.metaOtpLanguage },
      components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
    },
  })
}

// ── Public API ────────────────────────────────────────────────────────────

// Fire-and-forget dispatch used by reports/bookings/alerts hooks. Never
// throws — a delivery failure is recorded in the outbox, not raised.
// `deliveredBody` is set whenever the text that reached the phone differs
// from the draft (template fallback), so the UI can show the truth.
export async function dispatchWhatsApp(to: string, body: string): Promise<WaMessage> {
  const id = `W-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const transport = waTransport()
  const dest = normalizeWaNumber(to)
  if (transport === 'simulated') {
    console.log(`[whatsapp:simulated → ${dest}] ${body}`)
    return remember({ id, to: dest, body, transport, at: Date.now(), status: 'sent' })
  }
  try {
    const r = transport === 'meta' ? { sid: await deliverMeta(dest, body) } : transport === 'twilio' ? await deliverTwilio(dest, body) : await deliverMsg91(dest, body)
    console.log(`[whatsapp:${transport} → ${dest}] sent${r.sid ? ` (${r.sid})` : ''}${r.viaTemplate ? ' [via content template]' : ''}`)
    return remember({
      id, to: dest, body, transport, at: Date.now(), status: 'sent',
      providerId: r.sid, viaTemplate: r.viaTemplate, deliveredBody: r.deliveredBody,
    })
  } catch (err) {
    let error = String((err as Error)?.message ?? err)
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|SSL|TLS/i.test(error)) {
      error += ' — the server could not reach the messaging provider (no outbound internet?). Fix this host\'s network; the message was NOT delivered and the sample template was NOT used.'
    }
    console.error(`[whatsapp:${transport}] delivery to ${dest} failed: ${error}`)
    return remember({ id, to: dest, body, transport, at: Date.now(), status: 'failed', error })
  }
}

// Dispatcher-message helpers used by the trigger hooks. All fire-and-forget;
// a failure never breaks the primary request flow.
export const waAlert = async (severity: string, title: string, message: string) =>
  dispatchWhatsApp(dispatcherNumber(), `🚨 SETU-NER ${severity.toUpperCase()} ALERT\n${title}\n${message}\n— SETU-NER control room (reply TRACK <id> for status)`)

const WA_CARGO_LABEL: Record<string, string> = {
  medicine: 'Medicine', food: 'Food grains', fuel: 'Fuel', construction: 'Construction material',
  agri: 'Agricultural produce', relief: 'Relief supplies', pharma: 'Pharma / vaccines',
}

// `extraTo` = the shipper's own number, when the booking form provided one,
// so the confirmation reaches the person who booked and not only the
// dispatcher.
export const waBooking = async (bookingId: string, cargo: string, weightT: number, fromName: string, toName: string, lastMile: boolean, extraTo?: string) => {
  const text = `📦 SETU-NER booking CONFIRMED\n${bookingId}\n${WA_CARGO_LABEL[cargo] ?? cargo} · ${weightT}t\n${fromName} → ${toName}${lastMile ? '\n🤝 last-mile carrier attached' : ''}\nReply TRACK ${bookingId} any time for live status.`
  const sends = [dispatchWhatsApp(dispatcherNumber(), text)]
  if (extraTo && normalizeWaNumber(extraTo).length >= 10 && normalizeWaNumber(extraTo) !== normalizeWaNumber(dispatcherNumber())) sends.push(dispatchWhatsApp(extraTo, text))
  return Promise.all(sends)
}

export const waReport = async (reportId: string, incident: string, severity: string, location: string, description: string) =>
  dispatchWhatsApp(dispatcherNumber(), `🚧 SETU-NER incident report (${severity})\n${incident} · ${location}\n${description}\nID ${reportId} — field verification requested.`)

// Fire-and-forget situation-report push (used when Disaster Mode activates):
// the analysis engine's district-level summary paged to the dispatcher.
// dispatchWhatsApp never throws, so this can never break the request flow.
export const waSituationReport = async (report: { severity: string; summary: string; affected: number; generatedAt: string }) =>
  dispatchWhatsApp(dispatcherNumber(),
    `🌊 SETU-NER SITUATION REPORT (${report.severity.toUpperCase()})\n${report.summary}\nAffected districts: ${report.affected}\nGenerated ${new Date(report.generatedAt).toLocaleString('en-IN')}\n— SETU-NER control room`)

export const waConfig = () => ({
  transport: waTransport(),
  live: waEnabled(),
  provider: waTransport(),
  from: waTransport() === 'meta' ? `phone_number_id:${cfg.metaPhoneId}` : waTransport() === 'twilio' ? cfg.from ?? null : waTransport() === 'msg91' ? cfg.msg91IntegratedNumber ?? null : null,
  dispatcherTo: dispatcherNumber(),
  twilioTemplate: cfg.contentSid ?? null,
  msg91AlertTemplate: cfg.msg91AlertTemplate ?? null,
  msg91OtpTemplate: cfg.msg91OtpTemplate ?? null,
  metaOtpTemplate: cfg.metaOtpTemplate ?? null,
  metaUtilityTemplate: cfg.metaUtilityTemplate ?? null,
  // The template fallback only fires when the template's body pattern is
  // configured too — otherwise a refused free-form send fails loudly instead
  // of delivering unrelated template content (e.g. Twilio's sample reminder).
  twilioTemplateBody: templateBodyPattern() ? 'configured' : null,
  metaApiVersion: waTransport() === 'meta' ? cfg.metaVersion : null,
  statusCallback: env('TWILIO_STATUS_CALLBACK_URL') ?? null,
})
