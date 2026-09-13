import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

// Device tokens authenticate a PHYSICAL TRACKER on a vehicle, not a human
// user — deliberately separate from requireAuth/requireRole (auth.ts),
// which are for citizen/operator/logistics/official/admin JWTs. A device
// should never be able to do anything a JWT can (read other vehicles,
// file reports, etc.) — it can only POST its own vehicle's position.
//
// Tokens are deterministic (HMAC of the vehicle id + a server secret)
// rather than stored rows, so there's no migration/provisioning step for
// the hackathon build: any vehicle id already in the fleet has a valid
// token, computable by whoever holds DEVICE_TOKEN_SECRET. Production
// upgrade: move to stored, revocable per-device tokens (a DeviceToken
// table) issued at hardware-provisioning time — see PRODUCTION.md.
const DEVICE_TOKEN_SECRET = process.env.DEVICE_TOKEN_SECRET || 'dev-only-insecure-device-secret'

export function deviceTokenFor(vehicleId: string): string {
  return crypto.createHmac('sha256', DEVICE_TOKEN_SECRET).update(vehicleId).digest('hex').slice(0, 32)
}

/**
 * Verifies the `x-device-token` header against the vehicle id in the route
 * param. Rejects with 401 if missing or wrong — a device can only ever
 * authenticate as the vehicle its token was derived from.
 */
export function requireDeviceToken(req: Request, res: Response, next: NextFunction) {
  const vehicleId = req.params.id
  const token = req.headers['x-device-token']
  if (!vehicleId || typeof token !== 'string') {
    return res.status(401).json({ error: 'Missing x-device-token header' })
  }
  const expected = deviceTokenFor(vehicleId)
  // Constant-time compare to avoid timing side-channels on the token check.
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid device token for this vehicle' })
  }
  next()
}
