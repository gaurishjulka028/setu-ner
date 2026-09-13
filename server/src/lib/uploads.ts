// ── Local-disk photo upload handling (Part B) ─────────────────────────────
// Prototype storage: files land in <server>/uploads/photos (gitignored) and
// are served back statically by Express at /uploads/photos/....
//
// Production upgrade note: move to object storage (S3-compatible bucket)
// with signed URLs — the upload route below is the only place that writes
// files, so swapping multer.diskStorage for multer-s3 keeps every other
// caller (routes/reports.ts, static serving) unchanged apart from URL
// generation.
import fs from 'fs'
import path from 'path'
import multer from 'multer'

// Resolution order: UPLOAD_DIR env → <cwd>/uploads. The standard dev run is
// `cd server && npm run dev`, so this lands at server/uploads by default.
export function uploadsRoot(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads')
}

// Photos live in their own subfolder so /uploads/photos can later be scoped
// (auth/signed URLs) without touching other uploads if any appear.
export const photosDir = () => path.join(uploadsRoot(), 'photos')

// Only formats the analysis pipeline can decode (pure-JS JPEG/PNG readers —
// see lib/photo.ts). Phone photos are JPEG, screenshots PNG; HEIC/WebP are
// rejected with a clear message instead of being stored unanalyzable.
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

function ensureDirs() {
  fs.mkdirSync(photosDir(), { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureDirs()
      cb(null, photosDir())
    } catch (err) {
      cb(err as Error, '')
    }
  },
  filename: (_req, file, cb) => {
    // uid('P')-style filename: report ids are R-*, photo files P-*. The
    // original client filename is preserved separately in photoName.
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    cb(null, `P-${stamp}-${rand}${MIME_EXT[file.mimetype] ?? ''}`)
  },
})

export const photoUpload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB — field photos are big but bounded
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) return cb(null, true)
    cb(new Error('Unsupported photo format — please attach a JPEG or PNG image'))
  },
})
