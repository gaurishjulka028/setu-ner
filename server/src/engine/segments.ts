// Segment status sync — keeps the in-memory SEGMENTS array (which the risk
// engine, route planner and alert generator all read) in step with the
// `segments` table, where incident reports persist reportedStatus /
// reportReason.
//
// Before this, POST /api/reports wrote the status to BOTH places, but on a
// server restart only the DB copy survived — routes would happily go
// through a road that a verified report had blocked. The frontend had the
// same blind spot: it bundles its own copy of SEGMENTS and never learned
// about report-driven status changes at all (see GET /api/segments/status).
import { SEGMENTS } from '../data/ner'
import { prisma } from '../prisma'
import type { SegStatus } from '../data/types'

export interface SegmentStatusRow {
  segmentId: string
  reportedStatus: SegStatus | null
  reportReason: string | null
}

export async function loadSegmentStatuses(): Promise<void> {
  try {
    const rows = await prisma.segment.findMany({ select: { id: true, reportedStatus: true, reportReason: true } })
    const byId = new Map(rows.map(r => [r.id, r]))
    for (const seg of SEGMENTS) {
      const row = byId.get(seg.id)
      if (!row) continue
      seg.reportedStatus = (row.reportedStatus as SegStatus | null) ?? undefined
      seg.reportReason = row.reportReason ?? undefined
    }
  } catch (err) {
    console.error('loadSegmentStatuses: could not read segments table, using bundled defaults:', err)
  }
}

export async function setSegmentStatus(segmentId: string, status: SegStatus | null, reason: string | null): Promise<void> {
  const seg = SEGMENTS.find(s => s.id === segmentId)
  if (seg) {
    seg.reportedStatus = status ?? undefined
    seg.reportReason = reason ?? undefined
  }
  await prisma.segment.update({
    where: { id: segmentId },
    data: { reportedStatus: status, reportReason: reason },
  }).catch(() => { /* segment id not seeded — in-memory update still applied */ })
}

export function currentSegmentStatuses(): SegmentStatusRow[] {
  return SEGMENTS.map(s => ({
    segmentId: s.id,
    reportedStatus: s.reportedStatus ?? null,
    reportReason: s.reportReason ?? null,
  }))
}
