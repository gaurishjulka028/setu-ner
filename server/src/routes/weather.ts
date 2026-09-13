import { Router } from 'express'
import { z } from 'zod'
import { getWeatherPoint } from '../engine/weather'

const router = Router()

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

// GET /api/weather?lat=&lng= — proxies Open-Meteo server-side (moved out
// of setu-ner/src/lib/weather.ts) and caches per-coordinate for a few
// minutes so repeated calls for the same spot don't re-hit the API.
router.get('/weather', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'lat and lng query params are required numbers' })
  }
  const { lat, lng } = parsed.data
  const point = await getWeatherPoint(lat, lng)
  res.json(point)
})

export default router
