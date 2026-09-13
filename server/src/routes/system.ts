import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { uid } from '../lib/uid'
import { broadcastSystemState } from '../realtime'
import { waAlert, waSituationReport, dispatchWhatsApp } from '../lib/whatsapp'
import { getSituationReport } from '../engine/analysis'

const router = Router()

// ── Disaster Mode — region-wide emergency operations state ────────────────
// Before: a per-browser boolean; an official flipping it changed only their
// own screen. Now it is stored server-side, so activating it (a) shows the
// emergency banner + disaster overlays to EVERY connected user, (b) is
// logged as a high-severity alert, (c) pages the dispatcher on WhatsApp,
// and (d) survives reloads/restarts.
export interface DisasterState {
  active: boolean
  activatedBy?: string
  activatedAt?: number
  note?: string
}

const KEY = 'disasterMode'

export async function getDisasterState(): Promise<DisasterState> {
  const row = await prisma.systemState.findUnique({ where: { key: KEY } }).catch(() => null)
  if (!row) return { active: false }
  try { return JSON.parse(row.value) as DisasterState } catch { return { active: false } }
}

router.get('/system/disaster-mode', async (_req, res) => {
  res.json(await getDisasterState())
})

const setSchema = z.object({ active: z.boolean(), note: z.string().max(240).optional() })

router.put('/system/disaster-mode', requireAuth, requireRole('official', 'admin'), async (req, res) => {
  const parsed = setSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'active (boolean) is required' })
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } })
  const who = user?.name ?? req.user!.sub
  const state: DisasterState = parsed.data.active
    ? { active: true, activatedBy: who, activatedAt: Date.now(), note: parsed.data.note }
    : { active: false }

  await prisma.systemState.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(state), updatedBy: who, updatedAt: Date.now() },
    update: { value: JSON.stringify(state), updatedBy: who, updatedAt: Date.now() },
  })

  const disasterAlert = await prisma.alertItem.create({
    data: {
      id: uid('A'), type: 'disaster', severity: state.active ? 'high' : 'low',
      title: state.active ? 'DISASTER MODE ACTIVATED — emergency corridors in force' : 'Disaster mode stood down',
      location: 'Region-wide (NER)',
      message: state.active
        ? `Activated by ${who}${state.note ? ` — ${state.note}` : ''}. Emergency corridors, relief camps and last-known accessible paths are now highlighted for all users.`
        : `Deactivated by ${who}. Normal routing weights restored.`,
      action: state.active ? 'Prioritise medicine/relief convoys; hold construction freight; confirm relief-camp stock.' : 'None.',
      time: Date.now(), read: false,
    },
  })
  broadcastSystemState({ disasterMode: state, disasterAlert })
  if (state.active) {
    const driverMessage = `🚨 SETU-NER DISASTER ALERT\nEmergency corridors are in force across the North East.\n${state.note ? `Control-room note: ${state.note}\n` : ''}Follow the safest route shown in My Drive and do not enter blocked corridors.\n— SETU-NER control room`
    prisma.user.findMany({ where: { role: 'operator', phone: { not: null }, phoneVerifiedAt: { not: null } }, select: { phone: true } })
      .then(drivers => Promise.all(drivers.flatMap(d => d.phone ? [dispatchWhatsApp(d.phone, driverMessage)] : [])))
      .catch(err => console.error('[whatsapp] driver disaster broadcast failed:', err))
    waAlert('high', 'DISASTER MODE ACTIVATED', `By ${who}. Emergency corridors in force across NER.${state.note ? ` Note: ${state.note}` : ''}`).catch(() => {})
    // Fire-and-forget: page the dispatcher with the fused situation report
    // (Gemini when available, deterministic summary otherwise). Never blocks
    // or breaks the disaster-mode request.
    getSituationReport(true)
      .then(r => waSituationReport({ severity: r.severity, summary: r.summary, affected: r.affectedDistricts.length, generatedAt: r.generatedAt }))
      .catch(err => console.error('[whatsapp] situation-report hook failed:', err))
  }
  res.json(state)
})

export default router
