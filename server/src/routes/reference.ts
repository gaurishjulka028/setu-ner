import { Router } from 'express'
import type { Segment } from '../generated/prisma/client'
import { prisma } from '../prisma'

const router = Router()

// These three just serve the seeded data for now — no live logic yet.
// Public (no auth) to match the current frontend, which reads this data
// on the unauthenticated Home/PlanRoute/Track pages too.

router.get('/districts', async (_req, res) => {
  const districts = await prisma.district.findMany()
  res.json(districts)
})

router.get('/segments', async (_req, res) => {
  const segments = await prisma.segment.findMany()
  res.json(
    segments.map((s: Segment) => ({
      ...s,
      coords: JSON.parse(s.coords) as [number, number][],
      sensor: { vibration: s.sensorVibration, waterLevel: s.sensorWaterLevel, surface: s.sensorSurface },
      sensorVibration: undefined,
      sensorWaterLevel: undefined,
      sensorSurface: undefined,
    }))
  )
})

router.get('/facilities', async (_req, res) => {
  const facilities = await prisma.facility.findMany()
  res.json(facilities)
})

export default router
