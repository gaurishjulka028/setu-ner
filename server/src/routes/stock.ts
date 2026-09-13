import { Router } from 'express'
import { prisma } from '../prisma'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

// GET /api/stock — matches the Guarded roles={['official','admin','logistics']}
// wrapper on /gaps in App.tsx (Gaps.tsx reads STOCKS from ner.ts today).
router.get('/stock', requireAuth, requireRole('official', 'admin', 'logistics'), async (_req, res) => {
  const stock = await prisma.stockLevels.findMany()
  res.json(stock)
})

export default router
