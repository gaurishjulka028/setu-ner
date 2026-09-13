// Ported from generateAlerts() in setu-ner/src/store/useStore.ts. Same
// rules (blocked segment -> alert, high risk -> alert, heavy rain ->
// alert, stalled/delayed vehicle -> alert), same 6h dedupe-by-title
// window — now persisted to the alert_items table instead of a Zustand
// array, so it survives restarts and is shared across all clients.
import type { Season, Vehicle } from '../data/types'
import { SEGMENTS } from '../data/ner'
import { riskOf, currentSegmentId } from './risk'
import { getRegionWeather } from './weather'
import { prisma } from '../prisma'
import { uid } from '../lib/uid'
import { waAlert } from '../lib/whatsapp'
import { getGovtAlerts } from '../integrations/govtAlerts'
import { DISTRICTS } from '../data/ner'

function segMid(id: string): [number, number] {
  const s = SEGMENTS.find(x => x.id === id)!
  return s.coords[Math.floor(s.coords.length / 2)]
}

type NewAlert = {
  type: string; severity: 'high' | 'medium' | 'low'; title: string; location: string
  message: string; action: string; lat?: number; lng?: number; segmentId?: string
}

async function pushIfNew(a: NewAlert) {
  const cutoff = Date.now() - 1000 * 60 * 60 * 6
  const dupe = await prisma.alertItem.findFirst({ where: { title: a.title, time: { gt: cutoff } } })
  if (dupe) {
    // Self-heal alerts persisted before coordinates were attached (they
    // could never be placed on the map): backfill the position + segment
    // now that this generation pass knows it, so the map's Alerts layer
    // actually shows them without waiting for the 6 h dedupe to lapse.
    if ((dupe.lat == null || dupe.lng == null) && a.lat != null && a.lng != null) {
      const patch: { lat: number; lng: number; segmentId?: string } = { lat: a.lat, lng: a.lng }
      if (a.segmentId != null) patch.segmentId = a.segmentId
      await prisma.alertItem.update({ where: { id: dupe.id }, data: patch })
    }
    return
  }
  await prisma.alertItem.create({
    data: { ...a, id: uid('A'), time: Date.now(), read: false, resolved: false },
  })
  // Feature 4: high-severity engine alerts page the dispatcher on WhatsApp
  // (simulated transport logs to the outbox when Twilio env is absent).
  if (a.severity === 'high') {
    waAlert(a.severity, a.title, `${a.location}: ${a.message} — action: ${a.action}`).catch(err =>
      console.error('[whatsapp] alert hook failed:', err))
  }
}

// Fleet lifecycle alerts (arrival / slow-down) from realtime.ts — same
// dedupe + WhatsApp hook as the rule-based ones.
export const pushFleetAlert = (a: NewAlert) => pushIfNew(a)

export async function runAlertGeneration(season: Season, vehicles: Vehicle[]) {
  const weather = await getRegionWeather()

  // Official government alerts (NDMA SACHET) → one AlertItem each, deduped
  // by title like every other rule, so they reach the ticker, the Alerts
  // page and the WhatsApp dispatcher alongside the model's own alerts.
  try {
    const { alerts: official } = await getGovtAlerts()
    for (const g of official) {
      const d = DISTRICTS.find(x => g.districtIds.includes(x.id))
      await pushIfNew({
        type: /flood/i.test(g.event) ? 'flood' : /landslide/i.test(g.event) ? 'landslide' : 'weather',
        severity: g.severity,
        title: `${g.live ? 'OFFICIAL' : 'OFFICIAL (offline copy)'} · ${g.source}: ${g.event}`,
        location: g.areaDesc,
        message: g.headline,
        action: g.severity === 'high' ? 'Hold non-essential movement in the named districts; re-plan routes and pre-position relief stock.' : 'Monitor; advise convoys to carry extra time buffer.',
        lat: d?.lat, lng: d?.lng,
      })
    }
  } catch (err) {
    console.error('official alert ingestion failed:', err)
  }

  for (const seg of SEGMENTS) {
    const r = riskOf(seg, weather, season)
    const [lat, lng] = segMid(seg.id)
    if (seg.reportedStatus === 'blocked') {
      await pushIfNew({
        type: 'roadblock', severity: 'high',
        title: `${seg.name} — BLOCKED`,
        location: `${seg.to} / ${seg.from} corridor`,
        message: seg.reportReason ?? 'Road closed to traffic.',
        action: 'Hold all inbound freight; use alternate corridor. Field crew to confirm clearance time.',
        lat, lng, segmentId: seg.id,
      })
    } else if (r.status === 'caution' && r.total >= 58 && !seg.reportedStatus) {
      await pushIfNew({
        type: 'landslide', severity: 'medium',
        title: `High landslide risk: ${seg.name}`,
        location: seg.to,
        message: `Terrain risk ${r.total}/100 with ${r.rainMm} mm/h rainfall. ${seg.failureHistory} past monsoon failures on this stretch.`,
        action: 'Reroute heavy vehicles; dispatch sensor check; advise convoy travel.',
        lat, lng, segmentId: seg.id,
      })
    } else if (r.rainMm >= 20 && seg.terrain !== 'flat') {
      await pushIfNew({
        type: 'weather', severity: 'medium',
        title: `Heavy rain alert — ${seg.to} hills`,
        location: seg.to,
        message: `Intense rainfall (${r.rainMm} mm/h) over ${seg.terrain} terrain; water-level sensors elevated.`,
        action: 'Expect speed restrictions; monitor sensors hourly.',
        lat, lng, segmentId: seg.id,
      })
    }
  }

  for (const v of vehicles) {
    if (v.status === 'delivered') continue
    if (v.status === 'halted' && v.delayHours >= 6) {
      await pushIfNew({
        type: 'delay', severity: v.cargo === 'medicine' || v.cargo === 'relief' ? 'high' : 'medium',
        title: `${v.cargo === 'medicine' ? 'Medicine' : 'Relief'} convoy stalled — ${v.id}`,
        location: `En route ${v.to}`,
        message: `${v.cargoDetail}. Delayed ${v.delayHours} h due to corridor blockage.`,
        action: v.cargo === 'medicine' ? 'PRIORITY: assign alternate corridor / last-mile handoff now.' : 'Reroute via open corridor or stage at nearest depot.',
        lat: v.lat, lng: v.lng, segmentId: currentSegmentId(v),
      })
    }
    if (v.status === 'delayed' && v.delayHours >= 2 && !v.lastMile) {
      await pushIfNew({
        type: 'reroute', severity: 'low',
        title: `Predictive reroute advised — ${v.id}`,
        location: `En route ${v.to}`,
        message: `Risk rising ahead on planned corridor (${v.cargoDetail}). Pre-emptive reroute saves ~${Math.round(v.delayHours)} h vs waiting for closure.`,
        action: 'Accept system reroute suggestion in Route Planning.',
        lat: v.lat, lng: v.lng, segmentId: currentSegmentId(v),
      })
    }
  }
}
