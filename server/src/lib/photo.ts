// ── Real (if simple) image analysis for incident photos (Part B) ──────────
// classifyPhoto() in Report.tsx used to guess severity from words in the
// *filename* a citizen typed — it never looked at the picture. This module
// replaces that with an actual computer-vision read of the uploaded bytes:
//
//   1. decode the JPEG/PNG into RGBA pixels (pure-JS decoders, no native
//      image binaries — works anywhere Node runs),
//   2. sample the raw pixel grid down to a bounded lattice and measure
//      real image statistics (mean brightness, luminance variance, edge
//      energy from neighbor differences, colour saturation, colour cast),
//   3. map a "scene disruption" score derived from those pixels onto the
//      Severity scale used by the rest of the app.
//
// Honesty note: this is a demonstration-grade heuristic classifier, NOT a
// trained model — a wet landslide usually darkens the frame, kills colour
// and adds rubble texture vs a clean dry road surface, which is the signal
// these features capture. It is deliberately deterministic and cheap to
// run on every upload. Production upgrade path: swap `score()` for a small
// ONNX/TF.js image classifier (or an edge-deployed model on the phone)
// without touching the upload/storage plumbing.
//
// The same feature math is mirrored client-side in
// setu-ner/src/lib/photo.ts for the offline fallback (browser canvas can
// decode formats the server refuses, e.g. HEIC) — keep both in sync.
import { decode as decodeJpeg } from 'jpeg-js'
import { PNG } from 'pngjs'
import type { Severity } from '../data/types'

export interface PhotoFeatures {
  width: number
  height: number
  lumaMean: number // 0–255 average brightness
  lumaStd: number // 0–255 luminance spread (contrast)
  brightRatio: number // fraction of pixels brighter than luma 185
  edgeEnergy: number // 0–255 mean |neighbour luminance delta|
  bottomDarkRatio: number // fraction of bottom 70% of frame darker than luma 80
  earthRatio: number // fraction of brown/earth-toned pixels (r−b≥20, r−g≥5, luma<170)
  neutralRatio: number // fraction of low-chroma grey pixels (max−min < 24)
  blueBias: number // (meanB − meanR)/255, −1..1 (cyan flood/sky cast)
  disruption: number // 0–100 combined scene-disruption score
}

export interface PhotoAnalysis extends PhotoFeatures {
  severity: Severity
  confidence: number // 0..1 — margin from the severity boundaries
}

export const MIN_SEVERITY_SCORE = 28
export const IMPASSABLE_SEVERITY_SCORE = 55

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))

function decodeRGBA(buffer: Buffer, mime: string): { width: number; height: number; data: Uint8Array } {
  if (mime === 'image/jpeg') {
    const img = decodeJpeg(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
    return { width: img.width, height: img.height, data: img.data as Uint8Array }
  }
  if (mime === 'image/png') {
    const png = PNG.sync.read(buffer)
    return { width: png.width, height: png.height, data: png.data as Uint8Array }
  }
  throw new Error('Unsupported image format (only JPEG/PNG can be analyzed)')
}

// Sample the full RGBA grid on a stride lattice (bounded at ~160×160 sample
// points regardless of source resolution) and accumulate genuine pixel
// statistics from the image content.
function extractFeatures(width: number, height: number, data: Uint8Array): PhotoFeatures {
  const sx = Math.max(1, Math.ceil(width / 160))
  const sy = Math.max(1, Math.ceil(height / 160))

  const row = width * 4
  const bottomStart = height * 0.3 // row threshold — debris/mud sits low, sky high
  let n = 0
  let lumaSum = 0, lumaSq = 0, blueSum = 0, redSum = 0
  let bright = 0, bottomDark = 0, earth = 0, neutral = 0, bottomN = 0
  let edgeSum = 0, edgeN = 0

  for (let y = 0; y < height; y += sy) {
    for (let x = 0; x < width; x += sx) {
      const i = y * row + x * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      const chroma = mx - mn
      lumaSum += luma
      lumaSq += luma * luma
      blueSum += b
      redSum += r
      if (luma > 185) bright++
      if (y >= bottomStart) {
        bottomN++
        if (luma < 80) bottomDark++ // fresh slide mud / rubble / wet tarmac shadowing
      }
      // Brown/earth tones: mud, soil and landslide debris are warm-coloured
      // (unlike grey asphalt or vegetation greens).
      if (luma < 170 && r - b >= 20 && r - g >= 5) earth++
      if (chroma < 24) neutral++ // washed-out grey (rain-soaked scenes, asphalt)
      n++

      // Neighbour luminance deltas (horizontal + vertical) — real edge/texture
      // energy: rubble, debris and churned earth are full of high-frequency
      // edges, a clean road surface is not.
      const xi = (x + 1 < width) ? i + 4 : -1
      const yi = (y + 1 < height) ? i + row : -1
      if (xi !== -1) {
        const l2 = 0.299 * data[xi] + 0.587 * data[xi + 1] + 0.114 * data[xi + 2]
        edgeSum += Math.abs(luma - l2); edgeN++
      }
      if (yi !== -1) {
        const l3 = 0.299 * data[yi] + 0.587 * data[yi + 1] + 0.114 * data[yi + 2]
        edgeSum += Math.abs(luma - l3); edgeN++
      }
    }
  }

  const lumaMean = lumaSum / n
  const variance = Math.max(0, lumaSq / n - lumaMean * lumaMean)
  return {
    width, height,
    lumaMean,
    lumaStd: Math.sqrt(variance),
    brightRatio: bright / n,
    edgeEnergy: edgeN ? edgeSum / edgeN : 0,
    bottomDarkRatio: bottomN ? bottomDark / bottomN : 0,
    earthRatio: earth / n,
    neutralRatio: neutral / n,
    blueBias: (blueSum / n - redSum / n) / 255,
    disruption: 0, // filled by score()
  }
}

// Pixel-stat heuristics → 0–100 "scene disruption" score. Debris blocks a
// road by *covering the lower part of the frame* with dark, earthy, textured
// material — the terms measure exactly that, plus a grey "rain pallor" term
// for soaked scenes and a small cyan-boost for flood water. Clean asphalt is
// smooth and neutral, so dark *smooth* frames (a shadowed empty road) are
// explicitly de-weighted rather than read as debris.
// Mirrored in setu-ner/src/lib/photo.ts (offline fallback) — keep in sync.
export function score(f: Omit<PhotoFeatures, 'disruption'>): number {
  const earthy = clamp((f.earthRatio - 0.08) / 0.4) // brown mud/soil coverage
  const rough = clamp((f.edgeEnergy - 12) / 35) // rubble/churned-earth edges
  // Dark occlusion low in the frame — but only counts as debris when it is
  // also earthy or textured (mud/rubble); smooth dark asphalt stays neutral.
  const disruptive = clamp(f.bottomDarkRatio * (0.45 + 0.55 * Math.max(earthy, rough)))
  const disorder = clamp((f.lumaStd - 26) / 60) // uneven scene vs flat frame
  const grey = clamp((f.neutralRatio - 0.35) / 0.5) // washed-out monsoon grey
  const water = f.blueBias > 0.1 ? Math.min(0.5, (f.blueBias - 0.1) / 0.4) : 0 // cyan flood tint

  let d = 100 * (
    0.45 * disruptive +
    0.16 * disorder +
    0.15 * earthy +
    0.11 * grey +
    0.06 * rough +
    0.07 * water
  )
  // Sanity caps:
  // 1) a predominantly bright, open frame (sunlit road, lots of sky) can
  //    never read as impassable regardless of the other terms;
  // 2) bright sky ABOVE a dark smooth road is the signature of a normal
  //    open-road photo (sky up top, tarmac below) — cap it to minor.
  if (f.brightRatio > 0.45 || f.lumaMean > 150) d = Math.min(d, 45)
  if (f.brightRatio > 0.15 && f.bottomDarkRatio > 0.55) d = Math.min(d, 25)
  return Math.round(clamp(d, 0, 100))
}

export function severityOf(disruption: number): Severity {
  if (disruption >= IMPASSABLE_SEVERITY_SCORE) return 'impassable'
  if (disruption >= MIN_SEVERITY_SCORE) return 'partial'
  return 'minor'
}

function confidenceOf(disruption: number): number {
  // Confidence grows with how far the score sits from a decision boundary —
  // scores near 32/55 are genuinely ambiguous photos, scored honestly as such.
  const margin = Math.min(
    Math.abs(disruption - MIN_SEVERITY_SCORE),
    Math.abs(disruption - IMPASSABLE_SEVERITY_SCORE),
  )
  return Math.round(clamp(0.55 + margin * 0.013, 0.55, 0.97) * 100) / 100
}

export function analyzePhoto(buffer: Buffer, mime: string): PhotoAnalysis {
  const { width, height, data } = decodeRGBA(buffer, mime)
  if (width < 4 || height < 4) throw new Error('Image is too small to analyze')
  const features = extractFeatures(width, height, data)
  const disruption = score(features)
  return {
    ...features,
    disruption,
    severity: severityOf(disruption),
    confidence: confidenceOf(disruption),
  }
}
