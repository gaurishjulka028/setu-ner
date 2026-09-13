// Loads the current contents of setu-ner/src/data/ner.ts (districts,
// segments, facilities) and the DEMO_USERS list from
// setu-ner/src/data/demoUsers.ts into the database, so the demo accounts
// behave identically after the switch to a real backend.
//
// DEMO_USERS is the SINGLE source of truth, shared with the frontend's
// login page (setu-ner/src/store/useStore.ts imports the same file) — no
// more hand-copied duplicate list that could silently drift out of sync.

// `npm run seed` runs this file through plain tsx (no Prisma CLI), so it
// must load server/.env itself — same as src/index.ts does for the API.
import 'dotenv/config'

import bcrypt from 'bcryptjs'
import { prisma } from '../src/prisma'
import { DISTRICTS, SEGMENTS, FACILITIES, STOCKS, SEED_REPORTS, SEED_BOOKINGS } from '../../setu-ner/src/data/ner'
import { DEMO_USERS } from '../../setu-ner/src/data/demoUsers'

async function main() {
  console.log('Seeding districts...')
  for (const d of DISTRICTS) {
    await prisma.district.upsert({ where: { id: d.id }, create: d, update: d })
  }

  console.log('Seeding segments...')
  for (const s of SEGMENTS) {
    const row = {
      id: s.id,
      name: s.name,
      road: s.road,
      roadType: s.roadType,
      from: s.from,
      to: s.to,
      districtId: s.districtId,
      coords: JSON.stringify(s.coords),
      lengthKm: s.lengthKm,
      terrain: s.terrain,
      slope: s.slope,
      elevation: s.elevation,
      bridge: s.bridge ?? null,
      singleLane: s.singleLane ?? null,
      failureHistory: s.failureHistory,
      baseCondition: s.baseCondition,
      sensorVibration: s.sensor.vibration,
      sensorWaterLevel: s.sensor.waterLevel,
      sensorSurface: s.sensor.surface,
      reportedStatus: s.reportedStatus ?? null,
      reportReason: s.reportReason ?? null,
    }
    await prisma.segment.upsert({ where: { id: s.id }, create: row, update: row })
  }

  console.log('Seeding facilities...')
  for (const f of FACILITIES) {
    const row = { ...f, note: f.note ?? null }
    await prisma.facility.upsert({ where: { id: f.id }, create: row, update: row })
  }

  console.log('Seeding stock levels...')
  for (const s of STOCKS) {
    await prisma.stockLevels.upsert({ where: { districtId: s.districtId }, create: s, update: s })
  }

  // Demo incident reports + bookings — the frontend used to ship these as
  // in-memory seeds; with a real backend they must exist in the DB or the
  // first authenticated fetch wipes them from the UI (empty verification
  // queue, no last-mile panels on Track). Only inserted when missing so
  // re-seeding never clobbers reports/bookings created through the app.
  console.log('Seeding demo reports...')
  for (const r of SEED_REPORTS) {
    const row = {
      id: r.id, type: r.type, severity: r.severity, description: r.description,
      lat: r.lat, lng: r.lng, location: r.location ?? null, segmentId: r.segmentId ?? null,
      districtId: r.districtId ?? null, reporter: r.reporter, reporterRole: r.reporterRole,
      photoName: r.photoName ?? null, photoUrl: null, photoSeverity: r.photoSeverity ?? null,
      photoConfidence: r.photoConfidence ?? null, status: r.status, confidence: r.confidence,
      points: r.points, createdAt: r.createdAt, synced: true,
    }
    await prisma.incidentReport.upsert({ where: { id: r.id }, create: row, update: {} })
  }

  console.log('Seeding demo bookings...')
  for (const b of SEED_BOOKINGS) {
    const row = {
      id: b.id, shipper: b.shipper, fromDistrict: b.fromDistrict, toDistrict: b.toDistrict,
      cargo: b.cargo, weightT: b.weightT, vehicleId: b.vehicleId ?? null, status: b.status,
      lastMile: b.lastMile, communityCarrier: b.communityCarrier ?? null,
      warehouseOut: b.warehouseOut ?? false, depotReached: b.depotReached ?? false,
      villageReceived: b.villageReceived ?? false, createdAt: b.createdAt,
    }
    await prisma.booking.upsert({ where: { id: b.id }, create: row, update: {} })
  }

  console.log('Seeding demo users...')
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10)
    const row = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      org: u.org,
      districtId: u.districtId,
      points: 'points' in u ? u.points : null,
      badges: 'badges' in u ? JSON.stringify(u.badges) : undefined,
      phone: 'phone' in u ? u.phone : null,
      phoneVerifiedAt: Date.now(), // demo accounts are pre-verified
      authProvider: 'password',
      passwordHash,
    }
    await prisma.user.upsert({ where: { id: u.id }, create: row, update: row })
  }

  console.log('Seed complete.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
