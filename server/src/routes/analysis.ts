import { Router } from 'express'
import { getSituationReport, forceRefreshAnalysis, analysisStatus, testProvider } from '../engine/analysis'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/analysis/disaster — the fused situation report (overall severity,
// affected districts, recommended actions). Degrades to the deterministic
// local summary (live:false + reason) when the provider is unreachable.
router.get('/analysis/disaster', requireAuth, async (_req, res) => {
  const report = await getSituationReport()
  res.json({ ...report, status: analysisStatus() })
})

// POST /api/analysis/disaster/refresh — force a fresh run now (Disaster page
// "Refresh" button), mirroring forceRefreshGovtAlerts().
router.post('/analysis/disaster/refresh', requireAuth, async (_req, res) => {
  const report = await forceRefreshAnalysis()
  res.json({ ...report, status: analysisStatus() })
})

// POST /api/analysis/test — one-shot connectivity self-test against the
// configured provider (a tiny live "ping" call). Green/red answer for a demo.
router.post('/analysis/test', requireAuth, async (_req, res) => {
  res.json(await testProvider())
})

export default router
