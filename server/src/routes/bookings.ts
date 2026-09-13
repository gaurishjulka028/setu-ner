import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { uid } from '../lib/uid'
import { markDelivered } from '../engine/vehicles'
import { broadcastVehicles } from '../realtime'
import { waBooking } from '../lib/whatsapp'
import { DISTRICTS } from '../data/ner'

const router = Router()

const CargoType = ['medicine', 'food', 'fuel', 'construction', 'agri', 'relief', 'pharma'] as const

// Last-mile community carriers by destination district — the same four
// networks listed on the Bookings page. A booking that asks for last-mile
// gets matched here so the card shows a real carrier instead of staying
// on "requested" forever.
const COMMUNITY_CARRIERS: { name: string; districts: string[] }[] = [
  { name: 'Jaintia Village Transport Co-op', districts: ['JWI', 'HFL', 'SHL'] },
  { name: 'CCpur Local Van Union', districts: ['CCP', 'IMP'] },
  { name: 'Garo Hills SHG Carrier Network', districts: ['TUR', 'NST'] },
  { name: 'Mizo Hill Porter & Pony Collective', districts: ['AZL', 'LGL', 'CPH'] },
]
function matchCarrier(toDistrict: string): string | undefined {
  return COMMUNITY_CARRIERS.find(c => c.districts.includes(toDistrict))?.name
    ?? COMMUNITY_CARRIERS[0].name
}

// GET/POST /api/bookings both require auth, matching the Guarded (any
// authenticated user) wrapper on /bookings in App.tsx.
router.get('/bookings', requireAuth, async (_req, res) => {
  const bookings = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(bookings)
})

const createBookingSchema = z.object({
  shipper: z.string().min(1),
  fromDistrict: z.string().min(1),
  toDistrict: z.string().min(1),
  cargo: z.enum(CargoType),
  weightT: z.number().positive(),
  vehicleId: z.string().optional(),
  lastMile: z.boolean().optional(),
  communityCarrier: z.string().optional(),
  // Optional WhatsApp number of the person booking — the confirmation and
  // TRACK replies go to them as well as the dispatcher. Not persisted
  // (no PII column in the hackathon schema); used only for this dispatch.
  contactPhone: z.string().max(20).optional(),
})

// POST /api/bookings — mirrors addBooking() in useStore.ts.
router.post('/bookings', requireAuth, requireRole('logistics', 'official', 'admin'), async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid booking payload', details: parsed.error.flatten() })
  }
  const body = parsed.data
  if (body.fromDistrict === body.toDistrict) {
    return res.status(400).json({ error: 'Origin and destination districts must be different' })
  }
  const lastMile = body.lastMile ?? false
  const communityCarrier = body.communityCarrier ?? (lastMile ? matchCarrier(body.toDistrict) : undefined)
  const booking = await prisma.booking.create({
    data: {
      id: uid('B'),
      shipper: body.shipper,
      fromDistrict: body.fromDistrict,
      toDistrict: body.toDistrict,
      cargo: body.cargo,
      weightT: body.weightT,
      vehicleId: body.vehicleId,
      status: body.vehicleId ? 'assigned' : 'requested',
      lastMile,
      communityCarrier,
      warehouseOut: false,
      depotReached: false,
      villageReceived: false,
      createdAt: Date.now(),
    },
  })
  // Feature 4: booking-confirmed WhatsApp to the dispatcher (simulated
  // transport logs to the outbox when Twilio env is absent).
  const fromName = DISTRICTS.find(d => d.id === body.fromDistrict)?.hq ?? body.fromDistrict
  const toName = DISTRICTS.find(d => d.id === body.toDistrict)?.hq ?? body.toDistrict
  waBooking(booking.id, body.cargo, body.weightT, fromName, toName, body.lastMile ?? false, body.contactPhone).catch(err =>
    console.error('[whatsapp] booking hook failed:', err))
  res.status(201).json(booking)
})

// PATCH /api/bookings/:id/last-mile — mirrors confirmLastMile(): marks
// the booking delivered and, if it has an associated vehicle, marks that
// vehicle delivered in the live simulation too.
router.patch('/bookings/:id/last-mile', requireAuth, async (req, res) => {
  const existing = await prisma.booking.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Booking not found' })

  const updated = await prisma.booking.update({
    where: { id: existing.id },
    data: { villageReceived: true, status: 'delivered' },
  })

  if (existing.vehicleId) { markDelivered(existing.vehicleId); broadcastVehicles() }

  await prisma.alertItem.create({
    data: {
      id: uid('A'), type: 'report', severity: 'low',
      title: `Last-mile delivery confirmed — ${existing.id}`,
      location: 'Village handoff',
      message: 'Goods received at village level. Tracking loop closed.',
      action: 'None — delivery complete.',
      time: Date.now(), read: false,
    },
  })

  res.json(updated)
})

export default router
