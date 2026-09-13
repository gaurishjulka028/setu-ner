import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { uid } from '../lib/uid'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

// GET /api/alerts — public, matches the unauthenticated /alerts route in
// App.tsx.
router.get('/alerts', async (_req, res) => {
  const alerts = await prisma.alertItem.findMany({ orderBy: { time: 'desc' }, take: 60 })
  res.json(alerts)
})

const createAlertSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1),
  location: z.string().min(1),
  message: z.string().min(1),
  action: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  segmentId: z.string().optional(),
})

// POST /api/alerts — mirrors pushAlert() in useStore.ts. Requires sign-in:
// this feed is shown unauthenticated on the public /alerts page, so writing
// to it must not be. Any signed-in role may push one (dashboard requisition,
// SOS, synced-offline-report notices — see call sites of pushAlert()).
router.post('/alerts', requireAuth, async (req, res) => {
  const parsed = createAlertSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid alert payload', details: parsed.error.flatten() })
  }
  const alert = await prisma.alertItem.create({
    data: { ...parsed.data, id: uid('A'), time: Date.now(), read: false },
  })
  res.status(201).json(alert)
})

router.patch('/alerts/:id/read', async (req, res) => {
  const alert = await prisma.alertItem.update({ where: { id: req.params.id }, data: { read: true } }).catch(() => null)
  if (!alert) return res.status(404).json({ error: 'Alert not found' })
  res.json(alert)
})

// Dismissing a live public alert is a control-room action, not a public one —
// restrict to officials/admins (mirrors Alerts.tsx, which now only shows the
// "Mark Resolved" control to those roles).
router.patch('/alerts/:id/resolve', requireAuth, requireRole('official', 'admin'), async (req, res) => {
  const alert = await prisma.alertItem.update({ where: { id: req.params.id }, data: { resolved: true, read: true } }).catch(() => null)
  if (!alert) return res.status(404).json({ error: 'Alert not found' })
  res.json(alert)
})

export default router
