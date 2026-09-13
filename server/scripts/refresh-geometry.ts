// One-off road-geometry refresher.
//
// The server upgrades geometry in the background at boot, but that's awkward
// when you just want to force a re-fetch — e.g. after adding STADIA_API_KEY,
// or to lift a cache whose rows are all still at the bundled 'simplified'
// baseline. This runs exactly the same provider chain
// (Stadia Maps → public OSRM → leave alone) as
// POST /api/segments/geometry/refresh { force: true } and rewrites
// server/data/road-geometry.json, without booting Express, Prisma migrations
// or the fleet simulation.
//
//   npx tsx scripts/refresh-geometry.ts            # only missing/simplified rows
//   npx tsx scripts/refresh-geometry.ts --force    # every road segment again
//
// Exits 1 if no segment could be upgraded, so it's usable in CI / a setup
// step that must not silently ship schematic roads.
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import { serverRoot } from '../src/prisma'
import { SEGMENTS, isWaterway } from '../src/data/ner'
import { loadRoadGeometryCache, refreshRoadGeometry, currentGeometry, geometryStatus } from '../src/engine/geometry'

const force = process.argv.includes('--force') || process.argv.includes('-f')
const CACHE_PATH = path.resolve(serverRoot(), 'data', 'road-geometry.json')

function summariseCache(): { segments: number; full: number; simplified: number; provider: string } | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null
    const file = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as {
      provider?: string
      segments?: Record<string, { quality?: 'full' | 'simplified' }>
    }
    const rows = Object.values(file.segments ?? {})
    return {
      segments: rows.length,
      full: rows.filter(r => (r.quality ?? 'full') === 'full').length,
      simplified: rows.filter(r => r.quality === 'simplified').length,
      provider: file.provider ?? '?',
    }
  } catch {
    return null
  }
}

async function main() {
  const before = summariseCache()
  const st = geometryStatus()
  console.log('── road geometry refresh ─────────────────────────────────────────────')
  console.log(`cache:      ${before ? `${before.segments} rows — ${before.full} full, ${before.simplified} simplified (${before.provider})` : 'none'}`)
  console.log(`provider:   ${st.provider}${st.fallback ? ` (fallback: ${st.fallback})` : ''}`)
  console.log(`stadia key: ${st.stadiaKeyConfigured ? `configured (costing=${st.costing})` : 'NOT SET — will use public OSRM only'}`)
  console.log(`mode:       ${force ? 'force (re-fetch every road segment)' : 'upgrade missing / simplified rows only'}`)
  console.log('')

  loadRoadGeometryCache()
  const upgraded = await refreshRoadGeometry(force)

  const after = summariseCache()
  const final = geometryStatus()
  console.log('')
  console.log(`upgraded ${upgraded} segment(s) this run`)
  console.log(`cache:   ${after ? `${after.segments} rows — ${after.full} full, ${after.simplified} simplified (${after.provider})` : 'none'}`)
  console.log(`status:  ${final.snapped}/${final.total} on real geometry (Stadia ${final.byProvider.stadia}, OSRM ${final.byProvider.osrm}, schematic ${final.byProvider.schematic}), ${final.fullDetail} at full detail${final.error ? ` — error: ${final.error}` : ''}`)

  const roads = SEGMENTS.filter(s => !isWaterway(s))
  const rows = new Map(currentGeometry().map(r => [r.segmentId, r]))
  const stillSchematic = roads.filter(s => rows.get(s.id)?.source === 'schematic')
  if (stillSchematic.length) {
    console.log('')
    console.log(`still schematic (${stillSchematic.length}): ${stillSchematic.map(s => `${s.id} ${s.from}–${s.to}`).join(', ')}`)
  }

  if (!upgraded) {
    console.error('')
    console.error('Nothing upgraded. Check STADIA_API_KEY / network reachability to api.stadiamaps.com and router.project-osrm.org.')
    process.exit(1)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('[refresh-geometry] failed:', err)
  process.exit(1)
})
