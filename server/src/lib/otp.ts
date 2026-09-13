// ── Phone OTP (one-time password) for sign-up ──────────────────────────────
//
// Every new account must prove it controls a phone number: Google gives us a
// verified e-mail, this module gives us a verified phone.
//
//   POST /api/auth/otp/send   { phone }        → code delivered, { cooldownSec }
//   POST /api/auth/otp/verify { phone, code }  → { phoneToken }  (15-min JWT)
//   POST /api/auth/google     { idToken, phoneToken }  → account created
//
// Delivery channel (OTP_CHANNEL in server/.env, default "auto"):
//   sms        Twilio Programmable SMS — TWILIO_ACCOUNT_SID/AUTH_TOKEN +
//              TWILIO_SMS_FROM (or a Messaging Service SID). Trial credit is
//              free; Indian recipients must be verified numbers on a trial.
//   whatsapp   Re-uses the WhatsApp transport already configured for alerts
//              (Meta Cloud API test number is free; Twilio sandbox too).
//   simulated  No provider: the code is printed to the server log and — when
//              OTP_DEV_ECHO is not "false" and NODE_ENV isn't production —
//              returned to the client as `devCode` so the demo works offline.
//   auto       sms if TWILIO_SMS_FROM is set → whatsapp if a WhatsApp
//              transport is live → simulated.
//
// Codes are never stored in clear: we keep an HMAC of the code, a 5-minute
// expiry, an attempt counter (5 tries) and a per-number send budget
// (30 s cooldown, 6 sends / hour). State lives in the `otp_codes` table
// (one row per phone, overwritten on resend) so it survives a `tsx watch`
// restart in dev and works across more than one server instance — it used
// to live only in an in-memory Map, which silently dropped every pending
// code whenever the process restarted.
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { sendMsg91WhatsAppOtp, sendMetaWhatsAppOtp, dispatchWhatsApp, waTransport } from './whatsapp'
import { normalizePhone, isValidPhone } from './auth-rules'
import { prisma } from '../prisma'

export type OtpChannel = 'sms' | 'whatsapp' | 'simulated'

const CODE_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 30 * 1000
const MAX_SENDS_PER_HOUR = 6
const MAX_ATTEMPTS = 5
const PHONE_TOKEN_TTL = '15m'

// OTP_SECRET defaults to JWT_SECRET when unset. That's convenient, but it
// means rotating JWT_SECRET (e.g. the "change it before deploying" advice in
// .env.example) also silently invalidates every in-flight phoneToken — warn
// once at startup so that coupling isn't a surprise later.
let warnedOtpSecretFallback = false
const SECRET = () => {
  const explicit = process.env.OTP_SECRET
  if (explicit) return explicit
  if (!warnedOtpSecretFallback) {
    warnedOtpSecretFallback = true
    console.warn('[otp] OTP_SECRET is not set — falling back to JWT_SECRET. Rotating JWT_SECRET will also invalidate any in-flight phone-verification codes. Set OTP_SECRET in server/.env to decouple them.')
  }
  return process.env.JWT_SECRET || 'dev-only-insecure-otp-secret'
}
const env = (k: string) => (process.env[k] ?? '').trim() || undefined
const isProd = () => process.env.NODE_ENV === 'production'

const hashCode = (phone: string, code: string) =>
  crypto.createHmac('sha256', SECRET()).update(`${phone}:${code}`).digest('hex')

const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

export function otpChannel(): OtpChannel {
  const want = (env('OTP_CHANNEL') ?? 'auto').toLowerCase()
  const smsReady = Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && (env('TWILIO_SMS_FROM') || env('TWILIO_MESSAGING_SERVICE_SID')))
  const waReady = waTransport() !== 'simulated'
  if (want === 'sms') return smsReady ? 'sms' : 'simulated'
  if (want === 'whatsapp') return waReady ? 'whatsapp' : 'simulated'
  if (want === 'simulated' || want === 'off') return 'simulated'
  return smsReady ? 'sms' : waReady ? 'whatsapp' : 'simulated'
}

export const otpStatus = () => ({
  channel: otpChannel(),
  devEcho: otpChannel() === 'simulated' && devEchoEnabled(),
  ttlSec: CODE_TTL_MS / 1000,
  cooldownSec: RESEND_COOLDOWN_MS / 1000,
})

const devEchoEnabled = () => !isProd() && (env('OTP_DEV_ECHO') ?? 'true') !== 'false'

async function sendSms(to: string, body: string): Promise<void> {
  const sid = env('TWILIO_ACCOUNT_SID')!, token = env('TWILIO_AUTH_TOKEN')!
  const base = (env('TWILIO_API_BASE') ?? 'https://api.twilio.com').replace(/\/+$/, '')
  const form = new URLSearchParams({ To: `+${to}`, Body: body })
  if (env('TWILIO_MESSAGING_SERVICE_SID')) form.set('MessagingServiceSid', env('TWILIO_MESSAGING_SERVICE_SID')!)
  else form.set('From', env('TWILIO_SMS_FROM')!)
  const resp = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(15_000),
  })
  if (!resp.ok) {
    const j = await resp.json().catch(() => ({})) as { message?: string }
    throw new Error(j.message ?? `Twilio SMS ${resp.status}`)
  }
}

export class OtpError extends Error {
  constructor(public status: number, message: string, public retryAfterSec?: number) { super(message) }
}

/** Generates + delivers a code. Throws OtpError on validation / rate limits. */
export async function sendOtp(rawPhone: string): Promise<{ phone: string; channel: OtpChannel; cooldownSec: number; expiresInSec: number; devCode?: string }> {
  if (!isValidPhone(rawPhone)) throw new OtpError(400, 'Enter a valid 10-digit Indian mobile number.')
  const phone = normalizePhone(rawPhone)
  const now = Date.now()

  const prev = await prisma.otpCode.findUnique({ where: { phone } })
  if (prev && now - prev.sentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - prev.sentAt)) / 1000)
    throw new OtpError(429, `Please wait ${wait}s before requesting another code.`, wait)
  }
  const recent = (prev ? (JSON.parse(prev.sendLog) as number[]) : []).filter(t => now - t < 60 * 60 * 1000)
  if (recent.length >= MAX_SENDS_PER_HOUR) throw new OtpError(429, 'Too many codes requested for this number — try again in an hour.', 3600)

  const code = genCode()
  const channel = otpChannel()
  const body = `${code} is your SETU-NER verification code. Valid for 5 minutes. Do not share it.`
  try {
    if (channel === 'sms') await sendSms(phone, body)
    else if (channel === 'whatsapp') {
      if (waTransport() === 'msg91') {
        await sendMsg91WhatsAppOtp(phone, code)
      } else if (waTransport() === 'meta') {
        await sendMetaWhatsAppOtp(phone, code)
      } else {
        const m = await dispatchWhatsApp(phone, body)
        if (m.status === 'failed') throw new Error(m.error ?? 'WhatsApp delivery failed')
      }
    } else {
      console.log(`[otp:simulated → ${phone}] code ${code} (no SMS/WhatsApp provider configured)`)
    }
  } catch (err) {
    const raw = (err as Error).message ?? 'unknown error'
    let hint = ''
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|SSL|TLS|timeout/i.test(raw)) {
      hint = ' The API server could not reach the messaging provider (no outbound internet?). Fix the server\'s network, or set OTP_CHANNEL=simulated in server/.env to show codes on screen for offline testing.'
    } else if (channel === 'whatsapp' && /24[- ]hour|window|re-engagement/i.test(raw)) {
      hint = ' Ask the recipient to send ANY WhatsApp reply (e.g. "start") to the SETU-NER sender first — WhatsApp only delivers outside an active conversation via approved templates.'
    }
    throw new OtpError(502, `Could not deliver the code via ${channel}: ${raw}.${hint}`)
  }

  const row = {
    hash: hashCode(phone, code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sentAt: now,
    sendLog: JSON.stringify([...recent, now]),
  }
  await prisma.otpCode.upsert({ where: { phone }, create: { phone, ...row }, update: row })
  const out = { phone, channel, cooldownSec: RESEND_COOLDOWN_MS / 1000, expiresInSec: CODE_TTL_MS / 1000 }
  return channel === 'simulated' && devEchoEnabled() ? { ...out, devCode: code } : out
}

/** Checks a code; on success returns a short-lived signed proof of the phone. */
export async function verifyOtp(rawPhone: string, code: string): Promise<{ phone: string; phoneToken: string }> {
  if (!isValidPhone(rawPhone)) throw new OtpError(400, 'Enter a valid 10-digit Indian mobile number.')
  const phone = normalizePhone(rawPhone)
  const row = await prisma.otpCode.findUnique({ where: { phone } })
  const now = Date.now()
  if (!row || now > row.expiresAt) {
    if (row) await prisma.otpCode.delete({ where: { phone } }).catch(() => null)
    throw new OtpError(400, 'Code expired or not requested — tap "Send code" again.')
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.delete({ where: { phone } }).catch(() => null)
    throw new OtpError(429, 'Too many wrong attempts — request a new code.')
  }
  const given = String(code ?? '').replace(/\D/g, '')
  const a = Buffer.from(hashCode(phone, given)), b = Buffer.from(row.hash)
  if (given.length !== 6 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const attempts = row.attempts + 1
    await prisma.otpCode.update({ where: { phone }, data: { attempts } })
    throw new OtpError(400, `Incorrect code (${MAX_ATTEMPTS - attempts} attempts left).`)
  }
  await prisma.otpCode.delete({ where: { phone } }).catch(() => null)
  const phoneToken = jwt.sign({ phone, purpose: 'phone-verify' }, SECRET(), { expiresIn: PHONE_TOKEN_TTL } as jwt.SignOptions)
  return { phone, phoneToken }
}

/** Returns the verified phone encoded in a phoneToken, or null if invalid/expired. */
export function verifiedPhoneFromToken(token: string | undefined | null): string | null {
  if (!token) return null
  try {
    const p = jwt.verify(token, SECRET()) as { phone?: string; purpose?: string }
    return p.purpose === 'phone-verify' && p.phone ? p.phone : null
  } catch {
    return null
  }
}

// Housekeeping so the table doesn't grow forever on a long-running server.
setInterval(() => {
  prisma.otpCode.deleteMany({ where: { expiresAt: { lt: Date.now() - 60_000 } } }).catch(() => null)
}, 60_000).unref()
