import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users, Truck, Building2, ShieldCheck, ArrowRight, Loader2, Phone, KeyRound,
  CheckCircle2, Mail, Lock, User as UserIcon, Info, Eye, EyeOff, IdCard,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { Card, Button } from '../components/ui'
import { useToast } from '../components/Toast'
import { api, ApiError } from '../lib/api'
import { googleAuthEnabled, signInWithGoogle, resumeRedirectSignIn } from '../lib/firebase'
import { PASSWORD_RULE, passwordProblem, isFreeMail, isGovEmail } from '../lib/rbac'
import type { Role } from '../types'

// ── Sign-in & registration ────────────────────────────────────────────────
//
// One consistent card, two tabs, four roles:
//
//   SIGN IN — Google (works for EVERY account type: citizen, driver,
//   company, official — the server looks the account up by its Google
//   email/sub) or email + password. A brand-new non-gov Google account
//   becomes a Citizen; pick a role in "Create account" for anything else.
//
//   CREATE ACCOUNT — pick a role first; the form adapts:
//     Citizen / Driver … any email + password, phone OTP compulsory
//     Company ………… COMPANY email only (Gmail/Yahoo/Outlook rejected)
//     MDoNER Official … Google only, with a *.gov.in / *.nic.in account
//     Google sign-up is available for ALL roles (official requires the
//     gov domain), and the phone OTP is compulsory in every path.
//
// The UI mirrors the server's rules (lib/auth-rules.ts / routes/auth.ts);
// the server remains the single authority.

// ── Shared design tokens — every control on this page uses these ───────────
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-400'
const labelCls = 'flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-1'
const errorCls = 'flex items-start gap-2 rounded-lg border border-hazard/30 bg-hazard-light px-3 py-2.5 text-xs font-semibold text-hazard'

type RegisterRole = 'citizen' | 'operator' | 'logistics' | 'official'

const ROLE_META: { role: RegisterRole; icon: JSX.Element; titleKey: string; shortKey: string; reqKey: string }[] = [
  { role: 'citizen', icon: <Users size={17} />, titleKey: 'auth.citizen', shortKey: 'auth.shortCitizen', reqKey: 'auth.reqCitizen' },
  { role: 'operator', icon: <Truck size={17} />, titleKey: 'auth.operator', shortKey: 'auth.shortOperator', reqKey: 'auth.reqOperator' },
  { role: 'logistics', icon: <Building2 size={17} />, titleKey: 'auth.logistics', shortKey: 'auth.shortLogistics', reqKey: 'auth.reqLogistics' },
  { role: 'official', icon: <ShieldCheck size={17} />, titleKey: 'auth.official', shortKey: 'auth.shortOfficial', reqKey: 'auth.reqOfficial' },
]

type OtpStatus = { channel: 'sms' | 'whatsapp' | 'simulated'; devEcho: boolean; cooldownSec: number }

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  const code = (e as { code?: string })?.code
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google popup — allow popups for this site and try again.'
  if (code === 'auth/unauthorized-domain') {
    let host = 'this preview domain'
    try { host = window.location.host } catch { /* non-browser */ }
    return `Google sign-in is blocked here: "${host}" is not in your Firebase project's authorised domains. Fix: Firebase Console → Authentication → Settings → Authorized domains → add "${host}" (it works on localhost right away).`
  }
  if (code === 'auth/network-request-failed') return 'Network error talking to Google — check your connection.'
  if (code === 'auth/configuration-not-found' || code === 'auth/invalid-api-key') return 'Firebase Google sign-in is not configured correctly — check VITE_FIREBASE_* in setu-ner/.env.'
  // auth/embedded-frame, auth/popup-stuck, and the redirect-round-trip
  // failure thrown by resumeRedirectSignIn() all carry their own actionable
  // message — use it instead of guessing. This also covers any other
  // unexpected error with a useful .message instead of silently discarding
  // it behind a generic "can't reach the server" guess (that guess is only
  // right for an actual fetch failure, i.e. api.ts's own ApiError, already
  // handled above).
  if (e instanceof Error && e.message) return e.message
  return 'Could not reach the API server. Start it with `npm run dev` in the server folder, then try again.'
}

function GoogleErrorBanner({ error }: { error: string }) {
  const isFrameIssue = error.includes('embedded in a frame')
  let href = '#'
  try { href = window.location.href } catch { /* non-browser */ }
  return (
    <div className={errorCls + ' flex-col items-stretch'}>
      <div className="flex items-start gap-2"><AlertCircle />{error}</div>
      {isFrameIssue && (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-hazard underline decoration-2 underline-offset-2 hover:no-underline">
          Open this page in a new tab →
        </a>
      )}
    </div>
  )
}

const formatPhone = (raw: string) => raw.replace(/[^\d+ ]/g, '').slice(0, 16)
const phoneLooksValid = (raw: string) => raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '').length === 10

// ── Phone + OTP — identical block everywhere it appears ─────────────────────
function PhoneOtp({ phone, setPhone, onVerified, verified }: {
  phone: string
  setPhone: (p: string) => void
  onVerified: (phoneToken: string) => void
  verified: boolean
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [codeStage, setCodeStage] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [channel, setChannel] = useState<OtpStatus['channel'] | null>(null)

  useEffect(() => {
    api.get<OtpStatus>('/api/auth/otp/status').then(s => setChannel(s.channel)).catch(() => null)
  }, [])
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const send = async () => {
    if (busy || cooldown > 0) return
    if (!phoneLooksValid(phone)) { setError(t('auth.errPhone')); return }
    setError(null); setBusy(true)
    try {
      const r = await api.post<{ channel: OtpStatus['channel']; cooldownSec: number; devCode?: string }>('/api/auth/otp/send', { phone })
      setChannel(r.channel); setDevCode(r.devCode ?? null); setCooldown(r.cooldownSec)
      setSentTo(phone); setCode(''); setCodeStage(true)
    } catch (err) {
      if (err instanceof ApiError && typeof err.body?.retryAfterSec === 'number') setCooldown(err.body.retryAfterSec as number)
      setError(errMessage(err))
    } finally { setBusy(false) }
  }

  const verify = async () => {
    if (busy) return
    if (code.replace(/\D/g, '').length !== 6) { setError(t('auth.errCode')); return }
    setError(null); setBusy(true)
    try {
      const r = await api.post<{ phoneToken: string }>('/api/auth/otp/verify', { phone, code })
      onVerified(r.phoneToken)
      setCodeStage(false)
    } catch (err) { setError(errMessage(err)) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-canvas p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={labelCls + ' !mb-0'}><Phone size={13} /> {t('auth.phoneLabel')}</span>
        {verified
          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success"><CheckCircle2 size={12} /> {t('auth.phoneVerified')}</span>
          : <span className="text-[10px] font-semibold text-slate-400">{t('auth.phoneCompulsory')}</span>}
      </div>
      {verified ? (
        <div className="flex items-center justify-between rounded-lg border border-success/30 bg-white px-3 py-2.5">
          <span className="text-sm font-bold text-slate-700">+{phone.replace(/\D/g, '').replace(/^0/, '91')}</span>
          <span className="text-[10px] font-semibold text-slate-400">{t('auth.phoneVerifiedNote')}</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <input className={inputCls} inputMode="tel" placeholder="+91 98652 96833" value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))} disabled={busy} autoComplete="tel" />
            <Button variant="secondary" onClick={send} disabled={busy || cooldown > 0 || !phoneLooksValid(phone)} className="shrink-0 !px-3">
              {busy ? <Loader2 size={14} className="animate-spin" /> : cooldown > 0 ? `${cooldown}s` : t('auth.sendCode')}
            </Button>
          </div>
          {codeStage && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><KeyRound size={12} /> {t('auth.codeLabel')}</span>
                {sentTo && <span className="text-[10px] text-slate-400">{t('auth.codeSentTo', { phone: sentTo })}</span>}
              </div>
              <div className="flex gap-2">
                <input className={inputCls + ' tracking-[0.4em]'} inputMode="numeric" maxLength={6} placeholder="••••••" value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter') verify() }} disabled={busy} />
                <Button variant="primary" onClick={verify} disabled={busy || code.length !== 6} className="shrink-0 !px-3">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : t('auth.verifyCode')}
                </Button>
              </div>
              {devCode && (
                <div className="rounded-lg border border-dashed border-accent/50 bg-accent-light/40 px-3 py-2 text-[11px] font-bold text-slate-600">
                  {t('auth.devCode')} <span className="ml-1 font-mono text-base tracking-widest text-accent">{devCode}</span>
                </div>
              )}
              <p className="text-[10px] text-slate-400">
                {channel === 'whatsapp' ? t('auth.viaWhatsapp') : channel === 'simulated' ? t('auth.viaSimulated') : t('auth.viaSms')}
                {cooldown > 0 ? ` · ${t('auth.resendIn', { secs: cooldown })}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
      {error && <div className={errorCls + ' mt-2'}><AlertCircle />{error}</div>}
    </div>
  )
}

function AlertCircle() {
  return <Info size={14} className="mt-0.5 shrink-0" />
}

// ── Google button — one component, one look, used everywhere ────────────────
function GoogleButton({ label, onClick, disabled, busy }: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none">
      {busy ? <Loader2 size={16} className="animate-spin text-slate-500" /> : <GoogleG />} {label}
    </button>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      <span className="h-px flex-1 bg-slate-200" /> {label} <span className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Login() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const { showToast } = useToast()
  const login = useStore(s => s.login)
  const loginWithPassword = useStore(s => s.loginWithPassword)
  const register = useStore(s => s.register)
  const googleSignIn = useStore(s => s.googleSignIn)

  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<'signin' | 'register'>('signin')
  const [registerRole, setRegisterRole] = useState<RegisterRole>('citizen')

  // Google (shared by both tabs)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  // When the server demands the compulsory phone OTP mid-Google-flow, we
  // park the (still valid) id_token + requested role here and show the
  // phone block; verifying retries the exact same request.
  const [googlePhoneStage, setGooglePhoneStage] = useState<{ idToken: string; role?: RegisterRole } | null>(null)
  const [phone, setPhone] = useState('')

  // Sign in
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [siBusy, setSiBusy] = useState(false)
  const [siError, setSiError] = useState<string | null>(null)

  // Create account (password path)
  const [rName, setRName] = useState('')
  const [rOrg, setROrg] = useState('')
  const [rEmail, setREmail] = useState('')
  const [rPassword, setRPassword] = useState('')
  const [showRegPw, setShowRegPw] = useState(false)
  const [phoneToken, setPhoneToken] = useState<string | null>(null)
  // Registration is deliberately two-step: phone + OTP first, then account details.
  const [registerStep, setRegisterStep] = useState<'phone' | 'details'>('phone')
  const [regBusy, setRegBusy] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)

  // Session-expired notice + resume a Google redirect sign-in (popup fallback).
  useEffect(() => {
    try {
      const n = sessionStorage.getItem('setu-auth-notice')
      if (n) { setNotice(n); sessionStorage.removeItem('setu-auth-notice') }
    } catch { /* noop */ }
    resumeRedirectSignIn()
      .then(async idToken => {
        if (!idToken) return
        try { await googleSignIn(idToken); nav(next, { replace: true }) }
        catch (err) {
          if (err instanceof ApiError && err.body?.needsPhone === true) setGooglePhoneStage({ idToken })
          else setGoogleError(errMessage(err))
        }
      })
      .catch(err => setGoogleError(errMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = () => nav(next, { replace: true })
  const switchTab = (k: 'signin' | 'register') => {
    setTab(k); setGoogleError(null); setRegError(null); setSiError(null)
    if (k === 'register') setRegisterStep(phoneToken ? 'details' : 'phone')
  }

  // ── Demo one-click (seeded accounts) ────────────────────────────────────
  const [pendingRole, setPendingRole] = useState<Role | null>(null)
  const enter = async (r: Role) => {
    if (pendingRole) return
    setPendingRole(r); setSiError(null)
    try { await login(r); finish() } catch (e) {
      const msg = e instanceof ApiError && e.status === 401
        ? 'Demo account not found — run `npm run setup` in the server folder to seed the demo users.'
        : errMessage(e)
      showToast(msg, 'error')
    } finally { setPendingRole(null) }
  }

  // ── Google — one implementation for sign-in AND every register role ──────
  const runGoogle = async (opts: { role?: RegisterRole; retryToken?: string; retryPhoneToken?: string }) => {
    if (googleBusy) return
    setGoogleError(null)
    if (!googleAuthEnabled) {
      showToast(t('auth.googleDisabled'), 'error')
      return
    }
    setGoogleBusy(true)
    try {
      const idToken = opts.retryToken ?? await signInWithGoogle()
      if (!idToken) return
      try {
        await googleSignIn(idToken, opts.retryPhoneToken, opts.role)
        finish()
      } catch (err) {
        if (err instanceof ApiError && err.body?.needsPhone === true) {
          // Phone is compulsory — show the OTP block, keep the popup's token.
          setGooglePhoneStage({ idToken, role: opts.role })
          const known = err.body.knownPhone
          if (typeof known === 'string' && !phone) setPhone(known.replace(/^91(\d{10})$/, '$1'))
        } else {
          setGoogleError(errMessage(err))
        }
      }
    } catch (err) { setGoogleError(errMessage(err)) } finally { setGoogleBusy(false) }
  }
  const googleSignInFlow = () => runGoogle({})
  const googleRegisterFlow = () => runGoogle({ role: registerRole, retryPhoneToken: phoneToken ?? undefined })

  // ── Sign in with email + password ───────────────────────────────────────
  const doSignIn = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (siBusy) return
    setSiError(null); setSiBusy(true)
    try { await loginWithPassword(siEmail.trim(), siPassword); finish() }
    catch (err) { setSiError(errMessage(err)) } finally { setSiBusy(false) }
  }

  // ── Create account with email + password ────────────────────────────────
  const doRegister = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (regBusy || registerRole === 'official') return
    setRegError(null)
    if (rName.trim().length < 2) { setRegError(t('auth.errName')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rEmail.trim())) { setRegError(t('auth.errEmail')); return }
    if (isGovEmail(rEmail)) { setRegError(t('auth.errGovEmail')); return }
    if (registerRole === 'logistics' && isFreeMail(rEmail)) { setRegError(t('auth.errFreeMail')); return }
    const pw = passwordProblem(rPassword)
    if (pw) { setRegError(pw); return }
    if (!phoneToken) { setRegError(t('auth.errPhoneFirst')); return }
    setRegBusy(true)
    try {
      await register({
        name: rName.trim(),
        email: rEmail.trim(),
        password: rPassword,
        role: registerRole as 'citizen' | 'operator' | 'logistics',
        phone,
        phoneToken,
        org: registerRole === 'logistics' && rOrg.trim() ? rOrg.trim() : undefined,
      })
      showToast(t('auth.welcomeToast', { name: rName.trim().split(' ')[0], role: t(`auth.${registerRole}`) }), 'success')
      finish()
    } catch (err) { setRegError(errMessage(err)) } finally { setRegBusy(false) }
  }

  const roleMeta = ROLE_META.find(r => r.role === registerRole)!
  const isOfficial = registerRole === 'official'

  return (
    <div className="min-h-full bg-gradient-to-br from-primary-light via-canvas to-secondary-light">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 p-4 py-8">
        {/* brand */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-lg font-black text-white shadow-brand">SN</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">SETU-NER</h1>
          <p className="mt-1 text-xs text-slate-500">{t('tagline')} · MDoNER, Government of India</p>
        </div>

        {notice && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <span className="font-bold">Signed out:</span> {notice}
          </div>
        )}

        <Card className="p-5 sm:p-6">
          {/* tabs */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
            {(['signin', 'register'] as const).map(k => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold transition ${tab === k ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {k === 'signin' ? <><Mail size={13} /> {t('auth.signinTab')}</> : <><IdCard size={13} /> {t('auth.registerTab')}</>}
              </button>
            ))}
          </div>

          {googlePhoneStage ? (
            /* ── Google mid-flow phone step (compulsory OTP) ── */
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">{t('auth.phoneStepTitle')}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t('auth.phoneStepBody')}</p>
              </div>
              <PhoneOtp phone={phone} setPhone={setPhone} verified={false}
                onVerified={pt => { const ctx = googlePhoneStage; setGooglePhoneStage(null); void runGoogle({ role: ctx?.role, retryToken: ctx?.idToken, retryPhoneToken: pt }) }} />
              {googleError && <GoogleErrorBanner error={googleError} />}
              <button onClick={() => { setGooglePhoneStage(null); setGoogleError(null) }} className="text-xs font-bold text-slate-400 hover:text-slate-600">← {t('auth.backToSignin')}</button>
            </div>
          ) : tab === 'signin' ? (
            /* ── SIGN IN ── */
            <div className="space-y-4">
              <GoogleButton label={t('auth.continueGoogle')} onClick={googleSignInFlow} busy={googleBusy} />
              <p className="text-center text-[10.5px] leading-relaxed text-slate-400">{t('auth.googleSigninNote')}</p>
              <Divider label={t('auth.orEmail')} />

              <form onSubmit={doSignIn} className="space-y-3.5">
                <div>
                  <label className={labelCls} htmlFor="si-email"><Mail size={13} /> {t('auth.emailLabel')}</label>
                  <input id="si-email" className={inputCls} type="email" autoComplete="email" value={siEmail}
                    onChange={e => setSiEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <div>
                  <label className={labelCls} htmlFor="si-password"><Lock size={13} /> {t('auth.passwordLabel')}</label>
                  <div className="relative">
                    <input id="si-password" className={`${inputCls} pr-10`} type={showPw ? 'text' : 'password'} autoComplete="current-password"
                      value={siPassword} onChange={e => setSiPassword(e.target.value)} placeholder="••••••••" required />
                    <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                {siError && <div className={errorCls}><AlertCircle />{siError}</div>}
                <Button type="submit" variant="primary" className="w-full" disabled={siBusy}>
                  {siBusy ? <Loader2 size={15} className="animate-spin" /> : <><Mail size={15} /> {t('auth.signinTab')}</>}
                </Button>
              </form>

              <p className="text-center text-[11px] text-slate-400">
                {t('auth.noAccount')}{' '}
                <button onClick={() => switchTab('register')} className="font-bold text-primary hover:underline">{t('auth.registerTab')} →</button>
              </p>
            </div>
          ) : (
            /* ── CREATE ACCOUNT ── */
            <div className="space-y-4">
              {registerStep === 'phone' ? (
                <>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-800">Verify your mobile number</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Verify your phone with OTP first. After verification, the account details page will open.</p>
                  </div>

                  {/* Choose the account role before entering the details step. */}
                  <div>
                    <div className={labelCls}><IdCard size={13} /> {t('auth.pickRole')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLE_META.map(r => {
                        const active = registerRole === r.role
                        return (
                          <button key={r.role} type="button" onClick={() => { setRegisterRole(r.role); setRegError(null); setGoogleError(null) }}
                            className={`flex h-full flex-col rounded-xl border-2 p-2.5 text-left transition ${active ? 'border-primary bg-primary-light/50 shadow-card' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            aria-pressed={active}>
                            <span className="flex items-center gap-1.5">
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>{r.icon}</span>
                              <span className="text-[12px] font-extrabold leading-tight text-slate-800">{t(r.titleKey)}</span>
                            </span>
                            <span className="mt-1.5 text-[10px] font-semibold leading-snug text-slate-500">{t(r.shortKey)}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary-light/30 px-3 py-2">
                      <Info size={13} className="mt-0.5 shrink-0 text-primary" />
                      <p className="text-[11px] font-semibold leading-snug text-slate-600">{t(roleMeta.reqKey)}</p>
                    </div>
                  </div>

                  <PhoneOtp phone={phone} setPhone={setPhone} verified={false}
                    onVerified={pt => { setPhoneToken(pt); setRegError(null); setRegisterStep('details') }} />
                  {regError && <div className={errorCls}><AlertCircle />{regError}</div>}
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-800">Create your account</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Phone verified. Enter your account details or continue with Google.</p>
                    </div>
                    <button type="button" onClick={() => { setRegisterStep('phone'); setRegError(null); setGoogleError(null) }}
                      className="shrink-0 text-[11px] font-bold text-primary hover:underline">Change phone</button>
                  </div>

                  {isOfficial ? (
                    <div className="space-y-3.5">
                      {googleError && <GoogleErrorBanner error={googleError} />}
                      <GoogleButton label={t('auth.continueGoogleGov')} onClick={googleRegisterFlow} busy={googleBusy} />
                      <p className="text-center text-[10.5px] leading-relaxed text-slate-400">Use your verified government Google account. The selected role and domain rules are applied automatically.</p>
                    </div>
                  ) : (
                    <>
                      <form onSubmit={doRegister} className="space-y-3.5">
                        <div>
                          <label className={labelCls}><UserIcon size={13} /> {t('auth.fullName')}</label>
                          <input className={inputCls} value={rName} onChange={e => setRName(e.target.value)} placeholder={t('auth.fullNamePh')} autoComplete="name" required />
                        </div>
                        {registerRole === 'logistics' && (
                          <div>
                            <label className={labelCls}><Building2 size={13} /> {t('auth.orgLabel')}</label>
                            <input className={inputCls} value={rOrg} onChange={e => setROrg(e.target.value)} placeholder={t('auth.orgPh')} autoComplete="organization" />
                          </div>
                        )}
                        <div>
                          <label className={labelCls}><Mail size={13} /> {registerRole === 'logistics' ? t('auth.companyEmailLabel') : t('auth.emailLabel')}</label>
                          <input className={inputCls} type="email" autoComplete="email" value={rEmail} onChange={e => setREmail(e.target.value)}
                            placeholder={registerRole === 'logistics' ? 'ops@yourcompany.in' : 'you@example.com'} required />
                        </div>
                        <div>
                          <label className={labelCls}><Lock size={13} /> {t('auth.passwordLabel')}</label>
                          <div className="relative">
                            <input className={`${inputCls} pr-10`} type={showRegPw ? 'text' : 'password'} autoComplete="new-password"
                              value={rPassword} onChange={e => setRPassword(e.target.value)} placeholder="••••••••" required />
                            <button type="button" onClick={() => setShowRegPw(s => !s)} aria-label={showRegPw ? 'Hide password' : 'Show password'}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              {showRegPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">{PASSWORD_RULE}</p>
                        </div>

                        {regError && <div className={errorCls}><AlertCircle />{regError}</div>}
                        <Button type="submit" variant="primary" className="w-full" disabled={regBusy || !phoneToken}>
                          {regBusy ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> {t('auth.createAccount')}</>}
                        </Button>
                      </form>

                      <Divider label={t('auth.orGoogle')} />
                      {googleError && <GoogleErrorBanner error={googleError} />}
                      <GoogleButton label={t('auth.continueGoogle')} onClick={googleRegisterFlow} busy={googleBusy} />
                      <p className="text-center text-[10.5px] leading-relaxed text-slate-400">Your phone is already verified, so Google registration can complete immediately.</p>
                    </>
                  )}
                </>
              )}

              <p className="text-center text-[11px] text-slate-400">
                {t('auth.haveAccount')}{' '}
                <button onClick={() => switchTab('signin')} className="font-bold text-primary hover:underline">{t('auth.signinTab')} →</button>
              </p>
            </div>
          )}
        </Card>

        {/* demo accounts */}
        <details className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-card">
          <summary className="cursor-pointer text-xs font-bold text-slate-500">{t('auth.demo')} <span className="text-slate-400 font-normal">· JWT-secured API</span></summary>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(['citizen', 'operator', 'logistics', 'official'] as Role[]).map(r => (
              <button key={r} onClick={() => enter(r)} disabled={!!pendingRole}
                className="group text-left border-2 border-slate-200 hover:border-primary rounded-xl p-2.5 transition-all duration-200 flex items-center gap-2 hover:bg-primary-light/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none">
                <div className="w-8 h-8 rounded-lg bg-secondary-light text-secondary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition">
                  {r === 'citizen' ? <Users size={15} /> : r === 'operator' ? <Truck size={15} /> : r === 'logistics' ? <Building2 size={15} /> : <ShieldCheck size={15} />}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold text-[12px] text-slate-800">{t(`auth.${r}`)}</div>
                  <div className="text-[9.5px] text-slate-500">{pendingRole === r ? '…' : t(`auth.demoDesc${r[0].toUpperCase()}${r.slice(1)}`)}</div>
                </div>
                <ArrowRight size={12} className="ml-auto shrink-0 text-slate-300 group-hover:text-primary" />
              </button>
            ))}
            <button onClick={() => enter('admin')} disabled={!!pendingRole}
              className="col-span-2 text-left border-2 border-dashed border-slate-200 hover:border-primary rounded-xl p-2.5 transition flex items-center gap-2 hover:bg-primary-light/40 disabled:opacity-50">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><ShieldCheck size={15} /></div>
              <div className="text-[12px] font-bold text-slate-700">{pendingRole === 'admin' ? 'Signing in…' : t('auth.admin') + ' demo'}</div>
            </button>
          </div>
        </details>

        <p className="text-center text-[11px] text-slate-400">
          {t('auth.rbacNote')}
          <span className="mt-1 block"><Link to="/" className="text-secondary hover:underline">{t('auth.continueGuest')} →</Link></span>
        </p>
      </div>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.3 5.3C41.4 35.6 44 30.3 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}
