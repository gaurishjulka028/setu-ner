// ── Seeded demo accounts — single source of truth ───────────────────────────
//
// Previously this list was hand-duplicated: the frontend only kept an
// email/password lookup (DEMO_EMAILS in store/useStore.ts) while the FULL
// user rows (name, org, districtId, points, badges, phone) were re-typed
// straight into server/prisma/seed.ts with a comment claiming they were
// "copied from useStore.ts" — a list that never actually lived there. There
// was no compiler or runtime check tying the two together, so renaming an
// email or changing a role in one file would silently break the demo login
// in the other with no error until someone clicked the button.
//
// This file is the one place both sides import from:
//   - setu-ner/src/store/useStore.ts  → login(role) looks up the email here
//   - server/prisma/seed.ts           → creates/updates these exact rows
//
// Keep the frontend Role/User shapes and the seed script's Prisma row in
// sync by editing ONLY this file.
import type { Role } from '../types'

export interface DemoUser {
  id: string
  email: string
  name: string
  role: Role
  org: string
  districtId: string
  phone: string
  password: string
  points?: number
  badges?: string[]
}

export const DEMO_PASSWORD = 'demo'

export const DEMO_USERS: DemoUser[] = [
  { id: 'u-cit', email: 'citizen@setu-ner.demo', name: 'Anima Rabha', role: 'citizen', org: 'Public', districtId: 'KMG', points: 120, badges: ['Verified Eye'], phone: '919812345671', password: DEMO_PASSWORD },
  { id: 'u-op', email: 'operator@setu-ner.demo', name: 'Bibek Das', role: 'operator', org: 'NE Roadlines', districtId: 'NGN', phone: '919812345672', password: DEMO_PASSWORD },
  { id: 'u-log', email: 'logistics@setu-ner.demo', name: 'Kabir Logistics', role: 'logistics', org: 'Purvanchal Freight', districtId: 'GHY', phone: '919812345673', password: DEMO_PASSWORD },
  { id: 'u-off', email: 'official@setu-ner.demo', name: 'Dr. L. Hazarika', role: 'official', org: 'MDoNER, Guwahati', districtId: 'GHY', phone: '919812345674', password: DEMO_PASSWORD },
  { id: 'u-adm', email: 'admin@setu-ner.demo', name: 'Control Room Admin', role: 'admin', org: 'MDoNER HQ', districtId: 'GHY', phone: '919812345675', password: DEMO_PASSWORD },
]

/** email/role lookup used by the login page's one-click demo buttons. */
export const DEMO_EMAILS: Record<Role, string> = Object.fromEntries(DEMO_USERS.map(u => [u.role, u.email])) as Record<Role, string>
