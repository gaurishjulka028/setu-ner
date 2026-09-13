// ── Role-based access control (single source of truth, frontend) ────────────
//
// Which role may open which page. App.tsx guards every route with this,
// Shell.tsx filters the navigation with it, and the Home page filters its
// quick actions — so a user is never shown (or able to reach) a page that
// doesn't belong to their role. The server enforces the same matrix on the
// API (server/src/middleware/auth.ts requireRole) — this file only shapes
// the UI; it is never the actual security boundary.
//
// Roles (setu-ner/src/types.ts):
//   citizen   — the public: report incidents, follow relief shipments
//   operator  — drivers / fleet operators: drive, reroute, report, SOS
//   logistics — logistics companies: bookings, gaps, route planning
//   official  — MDoNER / district officials: command dashboard, verification,
//               disaster mode, requisitions (gov.in / nic.in sign-in only)
//   admin     — seeded control-room account: everything
//   guest     — not signed in: public pages only
import type { Role } from '../types'

export type PageId =
  | '/' | '/plan-route' | '/track' | '/report'
  | '/driver' | '/company' | '/bookings' | '/gaps'
  | '/dashboard' | '/verify' | '/disaster'
  | '/alerts' | '/notifications' | '/help'

/** role → pages it may open. Keep in sync with the server's requireRole calls. */
export const ROLE_PAGES: Record<Role | 'guest', PageId[]> = {
  guest: ['/', '/track', '/alerts', '/notifications', '/help'],
  citizen: ['/', '/track', '/report', '/alerts', '/notifications', '/help'],
  operator: ['/', '/driver', '/plan-route', '/track', '/report', '/alerts', '/notifications', '/help'],
  logistics: ['/', '/company', '/bookings', '/gaps', '/plan-route', '/track', '/alerts', '/notifications', '/help'],
  official: ['/', '/dashboard', '/verify', '/disaster', '/gaps', '/bookings', '/plan-route', '/track', '/report', '/alerts', '/notifications', '/help'],
  admin: ['/', '/dashboard', '/verify', '/disaster', '/gaps', '/bookings', '/company', '/driver', '/plan-route', '/track', '/report', '/alerts', '/notifications', '/help'],
}

export const canAccess = (role: Role | null | undefined, path: PageId | string): boolean => {
  const key = path === '/' ? '/' : `/${path.replace(/^\/+/, '')}`
  const pages = ROLE_PAGES[(role ?? 'guest') as Role | 'guest'] ?? ROLE_PAGES.guest
  return pages.includes(key as PageId)
}

/** Home-page quick actions each role sees (filtered copy of the public CTAs). */
export const roleHomeCtas = (role: Role | null | undefined): { plan: boolean; track: boolean; report: boolean } => ({
  plan: canAccess(role, '/plan-route'),
  track: true,
  report: canAccess(role, '/report'),
})

// ── Registration rules (mirrored server-side in lib/auth-rules.ts) ─────────

export const REGISTERABLE_ROLES = ['citizen', 'operator', 'logistics'] as const
export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number]

export const isGovEmail = (email: string): boolean => {
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  return domain === 'gov.in' || domain === 'nic.in' || domain.endsWith('.gov.in') || domain.endsWith('.nic.in')
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'outlook.com',
  'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'aol.com', 'rediffmail.com', 'yandex.com', 'mail.ru',
])
export const isFreeMail = (email: string): boolean => FREE_MAIL.has(email.trim().toLowerCase().split('@')[1] ?? '')

export const PASSWORD_RULE = 'At least 8 characters, with at least one letter and one number.'
export const passwordProblem = (pw: string): string | null => {
  if (pw.length < 8) return 'Password must be at least 8 characters long.'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain at least one letter and one number.'
  return null
}

export const ROLE_BADGE_TONE: Record<Role, 'blue' | 'green' | 'amber' | 'red' | 'slate'> = {
  citizen: 'green',
  operator: 'amber',
  logistics: 'blue',
  official: 'red',
  admin: 'slate',
}
