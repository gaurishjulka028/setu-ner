// Mirrors the Role union in setu-ner/src/types.ts — kept in one place so
// auth middleware and route guards stay in sync with the frontend.
export type Role = 'citizen' | 'operator' | 'logistics' | 'official' | 'admin'

export const ROLES: Role[] = ['citizen', 'operator', 'logistics', 'official', 'admin']

export interface JwtPayload {
  sub: string // user id
  role: Role
  districtId: string
}

// Augment Express's Request type with the authenticated user attached
// by the auth middleware.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}
