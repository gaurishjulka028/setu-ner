import { Router } from 'express'
import { govtFeed } from '../integrations/govtFeed'
import { getGovtAlerts, govtAlertsStatus, forceRefreshGovtAlerts } from '../integrations/govtAlerts'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/govt/road-closures — officially reported closures, from
// govtFeed.ts (currently the mock fixture; see that file's header for the
// production swap-in plan).
router.get('/govt/road-closures', async (_req, res) => {
  const closures = await govtFeed.fetchRoadClosures()
  res.json(closures)
})

// GET /api/govt/district-stock?districtId= — officially reported supply
// levels, independent of SETU-NER's own STOCKS seed data (GET /api/stock).
router.get('/govt/district-stock', async (req, res) => {
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : undefined
  const rows = await govtFeed.fetchDistrictStock(districtId)
  res.json(rows)
})

// GET /api/govt/alerts — official disaster alerts for NER from the NDMA
// SACHET CAP feed (IMD / CWC / SDMAs), mapped onto our district ids.
// `live:false` on the envelope means the feed was unreachable and the
// bundled fixture is being served instead.
router.get('/govt/alerts', async (req, res) => {
  const { alerts, live, fetchedAt, source } = await getGovtAlerts()
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : undefined
  res.json({
    live, fetchedAt, source,
    status: govtAlertsStatus(),
    alerts: districtId ? alerts.filter(a => a.districtIds.includes(districtId)) : alerts,
  })
})

// POST /api/govt/alerts/refresh — re-poll SACHET now (any signed-in user;
// the Alerts page "Retry live feed" button). Waits for the result so the
// caller can show live/offline immediately.
router.post('/govt/alerts/refresh', requireAuth, async (_req, res) => {
  const { alerts, live, fetchedAt, source } = await forceRefreshGovtAlerts()
  res.json({ live, fetchedAt, source, status: govtAlertsStatus(), alerts })
})

export default router
