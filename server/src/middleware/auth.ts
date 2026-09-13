import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { JwtPayload, Role } from '../types'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set — check server/.env')
}
if (JWT_SECRET === 'change-this-in-production-please') {
  console.warn('[auth] JWT_SECRET is the placeholder from .env.example — fine for a local demo, change it before deploying.')
}
// Tokens are signed with this secret. Every token in every browser stops
// working the moment the secret changes (401 → the app signs you out with
// an explanation), so keep it stable across restarts: it lives in server/.env,
// not in code, and nothing regenerates it automatically.

/**
 * Verifies the Bearer token on the Authorization header and attaches the
 * decoded payload to req.user. Rejects with 401 if the token is missing,
 * malformed, expired, or signed with the wrong secret.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  const token = header.slice('Bearer '.length)
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as JwtPayload
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

/**
 * Mirrors the client-side <Guarded roles={[...]}> checks in App.tsx, but
 * enforced server-side so a role restriction can't be bypassed by calling
 * the API directly. Must run after requireAuth.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role for this action' })
    }
    next()
  }
}
