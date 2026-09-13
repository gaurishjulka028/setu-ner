import fs from 'fs'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { uid } from '../lib/uid'
import { photoUpload } from '../lib/uploads'
import { analyzeIncidentPhoto, visionStatus } from '../lib/vision'
import { waReport } from '../lib/whatsapp'

import { setSegmentStatus } from '../engine/segments'
import { broadcastSegmentStatus } from '../realtime'

const router = Router()

const IncidentType = ['landslide', 'flood', 'roadblock', 'damage', 'accident', 'accessibility', 'weather', 'other'] as const
const Severity = ['minor', 'partial', 'impassable'] as const

const createReportSchema = z.object({
  type: z.enum(IncidentType),
  severity: z.enum(Severity),
  description: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  location: z.string().optional(),
  segmentId: z.string().optional(),
  districtId: z.string().optional(),
  photoName: z.string().optional(),
  // Absolute or root-relative URL returned by POST /api/reports/photo
  // (e.g. /uploads/photos/P-....jpg). Served statically by src/index.ts so
  // officials can view the actual image, not just its filename.
  photoUrl: z.string().optional(),
  photoSeverity: z.enum(Severity).optional(),
  photoConfidence: z.number().min(0).max(1).optional(),
})

// Multer errors (oversized file, wrong type) surface as clean JSON 4xx
// responses instead of Express's default HTML error page.
function uploadOnePhoto(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  photoUpload.single('photo')(req, res, (err: unknown) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo too large — max 12 MB' : err.message })
    }
    return res.status(415).json({ error: (err as Error).message || 'Unsupported photo' })
  })
}

// GET /api/reports/vision-status — which photo-AI provider is active.
router.get('/reports/vision-status', (_req, res) => res.json(visionStatus()))

// GET /api/reports — full report list (Report.tsx's "recent reports" feed).
router.get('/reports', requireAuth, async (_req, res) => {
  const reports = await prisma.incidentReport.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(reports)
})

// POST /api/reports/photo — multipart single-file upload (field name:
// "photo"). Stores the real image on local disk (server/uploads/photos),
// runs an actual pixel-level read of the uploaded bytes (see lib/photo.ts),
// and returns the stored URL + the CV severity read. The file itself is
// attached to the IncidentReport later via POST /api/reports + photoUrl.
//
// Production upgrade: object storage + signed URLs; classify with a real
// model (see lib/photo.ts). Endpoint stays the same shape.
router.post('/reports/photo', requireAuth, uploadOnePhoto, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Attach a photo as multipart field "photo" (JPEG or PNG)' })
  }
  try {
    const analysis = await analyzeIncidentPhoto(fs.readFileSync(req.file.path), req.file.mimetype)
    const photoUrl = `/uploads/photos/${req.file.filename}`
    return res.status(201).json({
      photoName: req.file.originalname,
      fileName: req.file.filename,
      photoUrl,
      // The AI read — from a vision model when VISION_PROVIDER is set,
      // otherwise the conservative pixel heuristic (see lib/vision.ts).
      severity: analysis.severity,
      confidence: analysis.confidence,
      relevance: analysis.relevance,
      incident: analysis.incident,
      summary: analysis.summary,
      provider: analysis.provider,
      model: analysis.model,
      width: analysis.features.width,
      height: analysis.features.height,
      features: analysis.features,
    })
  } catch (err) {
    // Unanalyzable/corrupt upload — don't leave an orphan file on disk.
    fs.unlink(req.file.path, () => {})
    return res.status(422).json({ error: (err as Error).message || 'Could not analyze that image' })
  }
})

// POST /api/reports — mirrors addReport() in useStore.ts: same initial
// confidence rule (photo present -> 0.5, else 0.35), same segment-status
// side effect for partial/impassable reports, same generated alert.
// Matches ROLE_PAGES['/report'] in the frontend (setu-ner/src/lib/rbac.ts):
// citizen/operator/official/admin can file field reports; logistics cannot.
router.post('/reports', requireAuth, requireRole('citizen', 'operator', 'official', 'admin'), async (req, res) => {
  const parsed = createReportSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid report payload', details: parsed.error.flatten() })
  }
  const body = parsed.data

  const reporterUser = await prisma.user.findUnique({ where: { id: req.user!.sub } })
  const reporter = reporterUser?.name ?? 'Anonymous citizen'
  const reporterRole = req.user!.role

  const report = await prisma.incidentReport.create({
    data: {
      id: uid('R'),
      type: body.type,
      severity: body.severity,
      description: body.description,
      lat: body.lat,
      lng: body.lng,
      location: body.location,
      segmentId: body.segmentId,
      districtId: body.districtId,
      reporter,
      reporterRole,
      photoName: body.photoName,
      photoUrl: body.photoUrl,
      photoSeverity: body.photoSeverity,
      photoConfidence: body.photoConfidence,
      status: 'pending',
      confidence: body.photoSeverity ? 0.5 : 0.35,
      points: 0,
      createdAt: Date.now(),
      synced: true,
    },
  })

  // High-severity reports immediately affect the live road layer, same as
  // the frontend mutating its in-memory SEGMENTS array.
  if (body.segmentId && (body.severity === 'partial' || body.severity === 'impassable')) {
    const nextStatus = body.severity === 'impassable' ? 'blocked' : 'caution'
    await setSegmentStatus(body.segmentId, nextStatus, body.description)
    broadcastSegmentStatus()
  }

  const alert = await prisma.alertItem.create({
    data: {
      id: uid('A'),
      type: 'report',
      severity: body.severity === 'minor' ? 'low' : 'high',
      title: `New ${body.type} report — ${body.severity}`,
      location: body.location ?? 'Field location',
      message: body.description,
      action: body.severity === 'impassable' ? 'Verify with field officer; treat corridor as blocked until confirmed.' : 'Review and confirm with nearby users.',
      lat: body.lat, lng: body.lng, segmentId: body.segmentId,
      time: Date.now(), read: false,
    },
  })

  // Feature 4: incident reports page the dispatcher over WhatsApp
  // (simulated transport logs to the outbox when Twilio env is absent).
  waReport(report.id, body.type, body.severity, body.location ?? 'field location', body.description).catch(err =>
    console.error('[whatsapp] report hook failed:', err))

  res.status(201).json({ report, alertId: alert.id })
})

const verifySchema = z.object({ approve: z.boolean() })

// PATCH /api/reports/:id/verify — mirrors verifyReport() in useStore.ts.
// Only official/admin could see the verify controls client-side
// (Report.tsx: isOfficial = role === 'official' || 'admin'); enforced
// server-side here too.
router.patch('/reports/:id/verify', requireAuth, requireRole('official', 'admin'), async (req, res) => {
  const parsed = verifySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'approve (boolean) is required' })
  }
  const { approve } = parsed.data

  const existing = await prisma.incidentReport.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Report not found' })

  const points = existing.points || (existing.severity === 'impassable' ? 50 : existing.severity === 'partial' ? 30 : 15)
  const updated = await prisma.incidentReport.update({
    where: { id: existing.id },
    data: approve
      ? { status: 'verified', confidence: Math.min(0.98, existing.confidence + 0.4), points, synced: true }
      : { status: 'rejected', confidence: Math.max(0.05, existing.confidence - 0.3) },
  })

  if (existing.segmentId) {
    if (approve && existing.severity === 'impassable') {
      await setSegmentStatus(existing.segmentId, 'blocked', existing.description)
      broadcastSegmentStatus()
    } else if (!approve && existing.severity !== 'minor') {
      // Rejected report: lift the provisional block/caution it applied, unless
      // another still-open report on the same stretch keeps it in force.
      const other = await prisma.incidentReport.findFirst({
        where: { segmentId: existing.segmentId, id: { not: existing.id }, status: { not: 'rejected' }, severity: { in: ['partial', 'impassable'] } },
        orderBy: { createdAt: 'desc' },
      })
      if (other) await setSegmentStatus(existing.segmentId, other.severity === 'impassable' ? 'blocked' : 'caution', other.description)
      else await setSegmentStatus(existing.segmentId, null, null)
      broadcastSegmentStatus()
    }
  }

  // Gamification: citizen reporters earn points on approval.
  if (approve && points) {
    const reporterUser = await prisma.user.findFirst({ where: { name: existing.reporter, role: 'citizen' } })
    if (reporterUser) {
      await prisma.user.update({
        where: { id: reporterUser.id },
        data: { points: (reporterUser.points ?? 0) + points },
      })
    }
  }

  res.json(updated)
})

export default router
