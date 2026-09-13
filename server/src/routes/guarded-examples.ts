import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

// These mirror the <Guarded roles={[...]}> checks in setu-ner/src/App.tsx,
// enforced here server-side. They're placeholders (no real logic yet —
// that lands in later parts) whose only job right now is to prove the
// auth + role middleware works end to end.

// Guarded (any authenticated user, no role restriction) — matches
// /report and /bookings in App.tsx.
router.get('/report/ping', requireAuth, (req, res) => {
  res.json({ ok: true, userId: req.user!.sub })
})

// Guarded roles={['official', 'admin']} — matches /dashboard.
router.get('/dashboard/ping', requireAuth, requireRole('official', 'admin'), (req, res) => {
  res.json({ ok: true, userId: req.user!.sub })
})

// Guarded roles={['official', 'admin', 'logistics']} — matches /gaps.
router.get('/gaps/ping', requireAuth, requireRole('official', 'admin', 'logistics'), (req, res) => {
  res.json({ ok: true, userId: req.user!.sub })
})

// Guarded roles={['official', 'admin']} — matches /disaster.
router.get('/disaster/ping', requireAuth, requireRole('official', 'admin'), (req, res) => {
  res.json({ ok: true, userId: req.user!.sub })
})

export default router
