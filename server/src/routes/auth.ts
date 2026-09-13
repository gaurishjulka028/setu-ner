import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../prisma'
import { requireAuth } from '../middleware/auth'
import { uid } from '../lib/uid'
import {
  isGovEmail, GOV_EMAIL_HINT, isSelfServiceRole, isValidEmail, isFreeMail,
  COMPANY_EMAIL_HINT, passwordProblem, PASSWORD_RULE, defaultOrg, normalizePhone,
} from '../lib/auth-rules'
import { sendOtp, verifyOtp, verifiedPhoneFromToken, otpStatus, OtpError } from '../lib/otp'
import { verifyIdentityToken } from '../lib/identity'
import type { JwtPayload, Role } from '../types'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET as string
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

// Sign-in surface (see PRODUCTION.md → Auth):
//   • Email + password registration is open to Citizen, Driver (operator)
//     and Logistics Company accounts — POST /auth/register. Every account,
//     without exception, must first verify its mobile number with a 6-digit
//     OTP (phoneToken from POST /auth/otp/verify). Company accounts must use
//     a company email address (no Gmail/Yahoo/Outlook free-mail domains).
//   • MDoNER Official accounts CANNOT self-register with a password — they
//     sign in with Google through Firebase using a *.gov.in / *.nic.in
//     address; Google vouches for the email, the server re-checks the
//     domain, and a non-gov Google account is never elevated to official.
//   • Roles are never self-claimed beyond that: `admin` is seeded only, and
//     operator→logistics-style escalations are granted by an admin.
//
// Phone verification (compulsory for every role):
//   POST /auth/otp/send → POST /auth/otp/verify → short-lived phoneToken,
//   presented to /auth/register or /auth/google.

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(80),
  email: z.string().trim().min(3, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
  // official/admin are deliberately absent — see the friendly rejection below.
  role: z.string().min(1, 'Choose a role to register as'),
  phone: z.string().min(7, 'Phone number is required'),
  phoneToken: z.string().optional(), // validated properly in the handler below
  org: z.string().trim().max(80).optional(),
  districtId: z.string().trim().max(8).optional(),
})

const googleSchema = z.object({
  idToken: z.string().min(10, 'idToken is required'),
  phoneToken: z.string().optional(), // proof of OTP-verified phone (new accounts)
  // Desired role for NEW accounts (the register tab's role picker). Every
  // role can sign up with Google; the domain rules still apply per role:
  //   official  -> MUST be a *.gov.in / *.nic.in Google account
  //   logistics -> MUST be a company email (no free-mail, no gov domain)
  //   citizen / operator -> any non-gov email
  // Existing accounts always sign in with their STORED role — the parameter
  // never upgrades or changes anyone. Without it the default derivation
  // applies: gov email -> official, anything else -> citizen.
  role: z.enum(['citizen', 'operator', 'logistics', 'official']).optional(),
})

const otpSendSchema = z.object({ phone: z.string().min(7, 'Phone number is required') })
const otpVerifySchema = z.object({ phone: z.string().min(7), code: z.string().min(4).max(8) })

type UserRow = {
  id: string
  email: string
  name: string
  role: string
  org: string
  districtId: string
  points: number | null
  badges: string | null
  passwordHash: string | null
  phone: string | null
  authProvider: string
  googleSub: string | null
  phoneVerifiedAt: number | null
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Invalid request'
}

/** Strips server-only fields and issues the session JWT. */
function issueSession(user: UserRow) {
  const payload: JwtPayload = { sub: user.id, role: user.role as JwtPayload['role'], districtId: user.districtId }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
  const { passwordHash: _p, googleSub: _g, ...safeUser } = user
  return { token, user: { ...safeUser, badges: user.badges ? JSON.parse(user.badges) : undefined } }
}

// ── Email + password sign-in ──────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstIssue(parsed.error) })
  }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  if (user.authProvider !== 'password' || !user.passwordHash) {
    return res.status(400).json({ error: 'This account signs in with Google — choose "Continue with Google".' })
  }
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  res.json(issueSession(user))
})

// ── Email + password registration (citizen / driver / company) ────────────

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) })
  const { name, password, role, phone, phoneToken, org, districtId } = parsed.data
  const email = parsed.data.email.toLowerCase()

  // Role rules FIRST — the clearest possible answer to "why can't I register
  // as an official with a password?"
  if (role === 'official' || role === 'admin') {
    return res.status(403).json({
      error: role === 'official'
        ? `${GOV_EMAIL_HINT}. Password registration is not available for this role — use "Continue with Google".`
        : 'Administrator accounts are provisioned by the control room and cannot self-register.',
    })
  }
  if (!isSelfServiceRole(role)) {
    return res.status(400).json({ error: 'Only Citizen, Driver and Company accounts can register here.' })
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  const pwProblem = passwordProblem(password)
  if (pwProblem) return res.status(400).json({ error: pwProblem })
  if (isGovEmail(email)) {
    return res.status(400).json({ error: `This looks like a government email. ${GOV_EMAIL_HINT} — use "Continue with Google".` })
  }
  if (role === 'logistics' && isFreeMail(email)) {
    return res.status(400).json({ error: COMPANY_EMAIL_HINT })
  }

  // Phone is compulsory: the OTP token must prove control of this number.
  if (!phoneToken) {
    return res.status(400).json({ error: 'Verify your mobile number with the OTP first — it is compulsory for every account.', needsPhone: true })
  }
  const verifiedPhone = verifiedPhoneFromToken(phoneToken)
  if (!verifiedPhone) {
    return res.status(400).json({ error: 'Your phone verification has expired — request a new OTP and try again.', needsPhone: true })
  }
  if (normalizePhone(phone) !== verifiedPhone) {
    return res.status(400).json({ error: 'The phone number changed since the OTP was verified — verify the new number.' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return res.status(409).json({
      error: existing.authProvider === 'google'
        ? 'An account with this email already signs in with Google — use "Continue with Google".'
        : 'An account with this email already exists — sign in instead.',
    })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      id: uid('u'),
      email,
      name,
      role,
      org: org?.trim() || defaultOrg(role, role === 'logistics' ? name : undefined),
      districtId: districtId || 'GHY',
      phone: verifiedPhone,
      phoneVerifiedAt: Date.now(),
      authProvider: 'password',
      passwordHash,
      googleSub: null,
    },
  })
  res.status(201).json(issueSession(user))
})

// ── Phone OTP ─────────────────────────────────────────────────────────────

router.get('/otp/status', (_req, res) => res.json(otpStatus()))

router.post('/otp/send', async (req, res) => {
  const parsed = otpSendSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) })
  try {
    res.json(await sendOtp(parsed.data.phone))
  } catch (err) {
    if (err instanceof OtpError) {
      if (err.retryAfterSec) res.setHeader('Retry-After', String(err.retryAfterSec))
      return res.status(err.status).json({ error: err.message, retryAfterSec: err.retryAfterSec })
    }
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/otp/verify', async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'phone and the 6-digit code are required' })
  try {
    res.json(await verifyOtp(parsed.data.phone, parsed.data.code))
  } catch (err) {
    if (err instanceof OtpError) return res.status(err.status).json({ error: err.message })
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── Google / Firebase sign-in ─────────────────────────────────────────────

router.post('/google', async (req, res) => {
  const parsed = googleSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'A Google id_token is required.' })
  }
  const { idToken, phoneToken, role: requestedRole } = parsed.data

  let identity: { sub: string; email: string; name: string }
  try {
    identity = await verifyIdentityToken(idToken)
  } catch (err) {
    return res.status(401).json({ error: `Could not verify Google sign-in: ${(err as Error).message}` })
  }

  const govEmail = isGovEmail(identity.email)
  const freeMail = isFreeMail(identity.email)

  // Requested-role domain rules — the SAME matrix as POST /auth/register,
  // enforced before any account is touched (existing or new).
  if (requestedRole === 'official' && !govEmail) {
    return res.status(403).json({ error: `You signed in with ${identity.email}. ${GOV_EMAIL_HINT}.` })
  }
  if (requestedRole === 'logistics' && govEmail) {
    return res.status(403).json({ error: `${identity.email} is a government address — register it under the MDoNER Official option instead.` })
  }
  if (requestedRole === 'logistics' && freeMail) {
    return res.status(403).json({ error: COMPANY_EMAIL_HINT })
  }
  if ((requestedRole === 'citizen' || requestedRole === 'operator') && govEmail) {
    return res.status(400).json({ error: `${identity.email} is a government address — use the MDoNER Official option to sign in.` })
  }

  const verifiedPhone = verifiedPhoneFromToken(phoneToken)

  // Existing account (by Google subject, then email) → sign in. Accounts
  // created before OTP existed (or seeded ones) are asked to verify their
  // phone once; a valid phoneToken in the same request completes that.
  let user = await prisma.user.findFirst({ where: { OR: [{ googleSub: identity.sub }, { email: identity.email }] } })
  if (user) {
    // A gov email may not be downgraded: a password account registered on a
    // gov address shouldn't exist (register blocks it), so this only guards
    // legacy data. Everyone else signs in with their stored role.
    const patch: Record<string, unknown> = {}
    if (!user.googleSub) patch.googleSub = identity.sub
    if (verifiedPhone) { patch.phone = verifiedPhone; patch.phoneVerifiedAt = Date.now() }
    if (!user.phoneVerifiedAt && !verifiedPhone) {
      return res.status(400).json({
        error: 'Please verify your phone number to continue.',
        needsPhone: true,
        role: user.role,
        knownPhone: user.phone ?? undefined,
      })
    }
    if (Object.keys(patch).length) user = await prisma.user.update({ where: { id: user.id }, data: patch })
    return res.json(issueSession(user))
  }

  // New account. The register tab's requested role wins (it already passed
  // the domain rules above); without one the email domain decides: a
  // government email signs in as MDoNER Official, everyone else as Citizen.
  const role: Role = requestedRole ?? (govEmail ? 'official' : 'citizen')
  if (!verifiedPhone) {
    return res.status(400).json({
      error: role === 'official'
        ? `An OTP-verified phone number is compulsory for the MDoNER Official role. ${GOV_EMAIL_HINT}`
        : 'An OTP-verified phone number is compulsory to complete sign-up.',
      needsPhone: true,
      role,
    })
  }

  user = await prisma.user.create({
    data: {
      id: uid('u'),
      email: identity.email,
      name: identity.name || identity.email.split('@')[0],
      role,
      org: defaultOrg(role),
      districtId: 'GHY',
      phone: verifiedPhone,
      phoneVerifiedAt: Date.now(),
      authProvider: 'google',
      googleSub: identity.sub,
      passwordHash: null,
    },
  })
  res.status(201).json(issueSession(user))
})

// Protected sanity-check route used by the acceptance test: requires a
// valid JWT and echoes back the identity the server derived from it.
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: issueSession(user).user })
})

export default router
