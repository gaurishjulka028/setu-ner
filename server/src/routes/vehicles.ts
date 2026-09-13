import { Router } from 'express'
import { getVehicles } from '../engine/vehicles'

const router = Router()

// GET /api/vehicles — current snapshot of the server-simulated fleet.
// The live-updating view of the same data is the /ws/vehicles socket
// channel (see src/realtime.ts), which pushes on the same interval this
// endpoint reads from.
router.get('/vehicles', (_req, res) => {
  res.json(getVehicles())
})

export default router
