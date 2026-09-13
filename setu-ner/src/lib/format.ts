// ── Shared formatting helpers ──────────────────────────────────────────────
export const timeAgo = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

export const clockTime = (t: number) =>
  new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const CARGO_LABEL: Record<string, string> = {
  medicine: 'Medicine', food: 'Food grains', fuel: 'Fuel',
  construction: 'Construction material', agri: 'Agricultural produce', relief: 'Relief supplies', pharma: 'Pharma / vaccines',
}

export const CARGO_PRIORITY: Record<string, number> = {
  medicine: 1, relief: 2, pharma: 3, food: 4, fuel: 5, construction: 6, agri: 7,
}
