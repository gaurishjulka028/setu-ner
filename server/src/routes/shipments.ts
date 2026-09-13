import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { uid } from '../lib/uid'
import { addVehicle, replaceRoute, getVehicle, snapshotFleetToDb, removeVehicle } from '../engine/vehicles'
import { broadcastVehicles } from '../realtime'
import { DISTRICTS, NODES, SEGMENTS } from '../data/ner'
import type { CargoType, Vehicle } from '../data/types'
import { waBooking } from '../lib/whatsapp'

const router = Router()

const CargoTypes = ['medicine', 'food', 'fuel', 'construction', 'agri', 'relief', 'pharma'] as const

const routeSchema = z.object({
  segIds: z.array(z.string().min(1)).min(1),
  distanceKm: z.number().nonnegative(),
  timeHours: z.number().nonnegative(),
  delayHours: z.number().nonnegative().default(0),
})

const startSchema = z.object({
  route: routeSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  cargo: z.enum(CargoTypes),
  weightKg: z.number().positive(),
  priority: z.enum(['standard', 'priority', 'urgent']).default('priority'),
  vehicleType: z.string().optional(),
  deadline: z.string().optional(),
})

function districtIdForTown(town: string, fallback: string): string {
  const q = town.trim().toLowerCase()
  for (const [code, n] of Object.entries(NODES)) {
    if (n.name.toLowerCase() === q) return code
  }
  const d = DISTRICTS.find(d => d.hq.toLowerCase() === q || d.name.toLowerCase().includes(q))
  return d?.id ?? fallback
}

function validSegments(segIds: string[]): boolean {
  const known = new Set(SEGMENTS.map(s => s.id))
  return segIds.every(id => known.has(id))
}

// POST /api/shipments — Plan Route → "Start Tracking". Creates a real
// vehicle in the shared simulated fleet plus its booking, both persisted,
// so the shipment survives refresh and shows up for every user.
// Mirrors startTracking() in setu-ner/src/store/useStore.ts.
router.post('/shipments', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), async (req, res) => {
  const parsed = startSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid shipment payload', details: parsed.error.flatten() })
  }
  const b = parsed.data
  if (!validSegments(b.route.segIds)) {
    return res.status(400).json({ error: 'route contains unknown segment ids' })
  }

  const id = uid('SHIP')
  const firstSeg = SEGMENTS.find(s => s.id === b.route.segIds[0])!
  const start = firstSeg.coords[0]
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } })

  const vehicle: Vehicle = {
    id,
    driver: b.vehicleType ? `${b.vehicleType} · SETU-NER route` : 'SETU-NER route vehicle',
    org: user?.org ?? 'SETU-NER planned shipment',
    cargo: b.cargo as CargoType,
    cargoDetail: `${b.weightKg} kg · ${b.priority} priority${b.deadline ? ` · due ${b.deadline}` : ''}`,
    weightT: b.weightKg / 1000,
    from: b.from,
    to: b.to,
    path: b.route.segIds,
    progressKm: 0,
    speedKmph: b.route.timeHours > 0 ? b.route.distanceKm / b.route.timeHours : 30,
    status: 'moving',
    delayHours: b.route.delayHours,
    lat: start[0],
    lng: start[1],
    trail: [start],
    routeStatus: 'active',
    lastMile: b.vehicleType === 'Community carrier' || undefined,
  }
  const placed = addVehicle(vehicle)

  const booking = await prisma.booking.create({
    data: {
      id: uid('B'),
      shipper: user?.org ?? user?.name ?? 'SETU-NER planned shipment',
      fromDistrict: districtIdForTown(b.from, 'GHY'),
      toDistrict: districtIdForTown(b.to, 'HFL'),
      cargo: b.cargo,
      weightT: b.weightKg / 1000,
      vehicleId: id,
      status: 'in_transit',
      lastMile: true,
      warehouseOut: true,
      depotReached: false,
      villageReceived: false,
      createdAt: Date.now(),
    },
  })

  await snapshotFleetToDb().catch(err => console.error('shipment snapshot failed:', err))
  broadcastVehicles()
  waBooking(booking.id, b.cargo, booking.weightT, b.from, b.to, true).catch(() => {})

  res.status(201).json({ vehicle: placed, booking })
})

const rerouteSchema = z.object({ route: routeSchema })

// PATCH /api/shipments/:id/route — Plan Route → "Apply New Route" for an
// existing shipment. Mirrors replaceTrackingRoute() in the frontend store.
router.patch('/shipments/:id/route', requireAuth, requireRole('operator', 'logistics', 'official', 'admin'), async (req, res) => {
  const parsed = rerouteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid route payload', details: parsed.error.flatten() })
  }
  const { route } = parsed.data
  if (!validSegments(route.segIds)) {
    return res.status(400).json({ error: 'route contains unknown segment ids' })
  }
  if (!getVehicle(req.params.id)) {
    return res.status(404).json({ error: `No vehicle with id ${req.params.id}` })
  }
  const speed = route.timeHours > 0 ? route.distanceKm / route.timeHours : 0
  const updated = replaceRoute(req.params.id, route.segIds, speed, route.delayHours)
  await snapshotFleetToDb().catch(err => console.error('reroute snapshot failed:', err))
  broadcastVehicles()
  res.json(updated)
})

// DELETE /api/shipments/:id — remove a shipment you started (or any, as
// official/admin) from the live fleet. Delivered demo shipments otherwise
// pile up on the map forever.
router.delete('/shipments/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const vehicle = getVehicle(id)
  if (!vehicle) return res.status(404).json({ error: `No vehicle with id ${id}` })
  if (!id.startsWith('SHIP-') && !['official', 'admin'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only officials/admins can remove fleet vehicles' })
  }
  await removeVehicle(id)
  await prisma.booking.updateMany({ where: { vehicleId: id, status: { not: 'delivered' } }, data: { status: 'delivered', villageReceived: true } }).catch(() => {})
  broadcastVehicles()
  res.status(204).end()
})

export default router
