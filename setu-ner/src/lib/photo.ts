// ── Client-side photo severity read (Part B) ──────────────────────────────
// Reads the ACTUAL pixels of the attached image (drawn to a canvas, sampled
// via getImageData) and derives brightness/contrast/edge/colour statistics,
// then maps them to the app's Severity scale. No filename guessing — the
// classification changes with what the image contains.
//
// Primary path: the file bytes are uploaded to POST /api/reports/photo and
// the server (server/src/lib/photo.ts) does the authoritative analysis on
// the stored copy. This module is the instant on-device read used for the
// attach-time preview, and the fallback when the app is offline or the
// server can't analyze a browser-decodable format (HEIC etc.).
//
// The feature math below mirrors server/src/lib/photo.ts — keep in sync.
import type { Severity } from '../types'

export interface PhotoRead {
  severity: Severity
  confidence: number // 0..1
  features: {
    lumaMean: number
    lumaStd: number
    bottomDarkRatio: number
    earthRatio: number
    neutralRatio: number
    edgeEnergy: number
    blueBias: number
    disruption: number
  }
}

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const MIN_SEVERITY_SCORE = 28
const IMPASSABLE_SEVERITY_SCORE = 55

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode that image'))
    img.src = url
  })
}

// Downscale to a bounded lattice and sample genuine pixel data.
async function samplePixels(file: File): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const img = await loadImage(file)
  const step = Math.max(1, Math.ceil(Math.max(img.naturalWidth, img.naturalHeight) / 160))
  const width = Math.max(1, Math.ceil(img.naturalWidth / step))
  const height = Math.max(1, Math.ceil(img.naturalHeight / step))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(img.src)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { width, height, data }
}

// Mirrors extractFeatures() + score() in server/src/lib/photo.ts.
export async function classifyPhoto(file: File): Promise<PhotoRead> {
  const { width, height, data } = await samplePixels(file)
  const n = width * height
  const bottomStart = height * 0.3 // debris/mud sits low in the frame, sky high
  let lumaSum = 0, lumaSq = 0, blueSum = 0, redSum = 0
  let bright = 0, bottomDark = 0, earth = 0, neutral = 0, bottomN = 0
  let edgeSum = 0, edgeN = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const chroma = mx - mn
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      lumaSum += luma
      lumaSq += luma * luma
      blueSum += b
      redSum += r
      if (luma > 185) bright++
      if (y >= bottomStart) {
        bottomN++
        if (luma < 80) bottomDark++
      }
      if (luma < 170 && r - b >= 20 && r - g >= 5) earth++
      if (chroma < 24) neutral++

      if (x + 1 < width) {
        const j = i + 4
        const l2 = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
        edgeSum += Math.abs(luma - l2); edgeN++
      }
      if (y + 1 < height) {
        const j = i + width * 4
        const l3 = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
        edgeSum += Math.abs(luma - l3); edgeN++
      }
    }
  }

  const lumaMean = lumaSum / n
  const variance = Math.max(0, lumaSq / n - lumaMean * lumaMean)
  const f = {
    lumaMean,
    lumaStd: Math.sqrt(variance),
    brightRatio: bright / n,
    edgeEnergy: edgeN ? edgeSum / edgeN : 0,
    bottomDarkRatio: bottomN ? bottomDark / bottomN : 0,
    earthRatio: earth / n,
    neutralRatio: neutral / n,
    blueBias: (blueSum / n - redSum / n) / 255,
  }

  // Same scoring as the server (see its docstring for why these terms).
  const earthy = clamp((f.earthRatio - 0.08) / 0.4)
  const rough = clamp((f.edgeEnergy - 12) / 35)
  const disruptive = clamp(f.bottomDarkRatio * (0.45 + 0.55 * Math.max(earthy, rough)))
  const disorder = clamp((f.lumaStd - 26) / 60)
  const grey = clamp((f.neutralRatio - 0.35) / 0.5)
  const water = f.blueBias > 0.1 ? Math.min(0.5, (f.blueBias - 0.1) / 0.4) : 0

  let d = 100 * (
    0.45 * disruptive +
    0.16 * disorder +
    0.15 * earthy +
    0.11 * grey +
    0.06 * rough +
    0.07 * water
  )
  // Bright/sky caps — see server score() for the rationale.
  if (f.brightRatio > 0.45 || f.lumaMean > 150) d = Math.min(d, 45)
  if (f.brightRatio > 0.15 && f.bottomDarkRatio > 0.55) d = Math.min(d, 25)
  const disruption = Math.round(clamp(d, 0, 100))

  const severity: Severity =
    disruption >= IMPASSABLE_SEVERITY_SCORE ? 'impassable'
      : disruption >= MIN_SEVERITY_SCORE ? 'partial' : 'minor'

  const margin = Math.min(
    Math.abs(disruption - MIN_SEVERITY_SCORE),
    Math.abs(disruption - IMPASSABLE_SEVERITY_SCORE),
  )
  const confidence = Math.round(clamp(0.55 + margin * 0.013, 0.55, 0.97) * 100) / 100

  return {
    severity,
    confidence,
    features: {
      lumaMean: Math.round(f.lumaMean),
      lumaStd: Math.round(f.lumaStd),
      bottomDarkRatio: Math.round(f.bottomDarkRatio * 100) / 100,
      earthRatio: Math.round(f.earthRatio * 100) / 100,
      neutralRatio: Math.round(f.neutralRatio * 100) / 100,
      edgeEnergy: Math.round(f.edgeEnergy),
      blueBias: Math.round(f.blueBias * 100) / 100,
      disruption,
    },
  }
}
