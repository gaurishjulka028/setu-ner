// Registration/SSO rules shared by the auth routes (and mirrored by the
// login UI). Kept in one module so the server is the single authority on
// who may register as what, and the frontend only mirrors these for UX.
//
// Government email test: `@gov.in` / `@nic.in` plus any subdomain of them
// (e.g. officer@assam.gov.in, dc@kamrup.nic.in). Deliberately does NOT
// accept look-alikes like `@gov.in.example.com` — the suffix must be the
// final label(s) of the domain.

export const GOV_EMAIL_SUFFIXES = ['.gov.in', '.nic.in'] as const

export function isGovEmail(email: string): boolean {
  const e = email.trim().toLowerCase()
  if (!e.includes('@')) return false
  const domain = e.slice(e.lastIndexOf('@') + 1)
  // bare `gov.in` / `nic.in` (someone@gov.in) or any subdomain (`*.gov.in`).
  return domain === 'gov.in' || domain === 'nic.in'
    || GOV_EMAIL_SUFFIXES.some(suffix => domain.endsWith(suffix))
}

export const GOV_EMAIL_HINT = 'MDoNER Official accounts require a government email — e.g. you@…gov.in or you@…nic.in (sign in with Google using that account)'

/**
 * Roles that can self-register with email + password:
 *   citizen  — the public
 *   operator — drivers / fleet operators
 *   logistics — logistics companies (company email required, see below)
 *
 * NOT self-registerable:
 *   official — must sign in with Google through Firebase using a *.gov.in /
 *              *.nic.in address (Google vouches for the domain; a typed
 *              password form could not).
 *   admin    — granted by seeding only.
 */
export type SelfServiceRole = 'citizen' | 'operator' | 'logistics'
export const SELF_SERVICE_ROLES: SelfServiceRole[] = ['citizen', 'operator', 'logistics']
export const isSelfServiceRole = (r: string): r is SelfServiceRole => (SELF_SERVICE_ROLES as string[]).includes(r)

/** Personal/free mailbox providers — rejected for the Company (logistics) role. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in',
  'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com',
  'proton.me', 'protonmail.com', 'aol.com', 'rediffmail.com', 'yandex.com', 'mail.ru',
])

export function emailDomain(email: string): string {
  const e = email.trim().toLowerCase()
  return e.includes('@') ? e.slice(e.lastIndexOf('@') + 1) : ''
}

/** True for consumer mailbox domains — companies must register on their own domain. */
export function isFreeMail(email: string): boolean {
  return FREE_MAIL_DOMAINS.has(emailDomain(email))
}

export const COMPANY_EMAIL_HINT = 'Logistics companies must register with a company email address (e.g. ops@yourcompany.in) — personal Gmail/Yahoo/Outlook addresses are not accepted for this role.'

/** Password policy: ≥ 8 chars, at least one letter and one digit. */
export function passwordProblem(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters long.'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain at least one letter and one number.'
  if (pw.length > 128) return 'Password is too long.'
  return null
}

export const PASSWORD_RULE = 'At least 8 characters, with at least one letter and one number.'

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

export function defaultOrg(role: string, name?: string): string {
  if (role === 'official') return 'Government official'
  if (role === 'logistics') return name?.trim() || 'Freight / logistics'
  if (role === 'operator') return 'Driver / fleet operator'
  return 'Public'
}

/**
 * Indian phone → E.164 digits (no '+', no spaces): "+91 98652 96833",
 * "9865296833", "09865296833" all → "919865296833". Returns '' when the
 * input has no digits at all.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits
}

/** 10-digit Indian mobile/national number (with or without +91/0 prefix). */
export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return true
  if (digits.length === 10) return true
  if (digits.length === 11 && digits.startsWith('0')) return true
  return false
}
