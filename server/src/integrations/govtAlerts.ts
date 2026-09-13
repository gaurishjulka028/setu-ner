// ── Official disaster alerts: NDMA SACHET (Common Alerting Protocol) ──────
//
// India's national alert hub (https://sachet.ndma.gov.in) republishes every
// warning issued by IMD (rain/thunderstorm), CWC (river floods), GSI/DGRE
// (landslides), INCOIS and the State Disaster Management Authorities in the
// international CAP format. Two public, key-less channels exist:
//
//   1. India CAP RSS feed   https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml
//      One <item> per active alert (title / description / link / pubDate,
//      often with cap:* extensions). This is the documented integration
//      channel for agencies and the primary source here.
//   2. Per-alert CAP XML    https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=<id>
//      Full CAP document. NDMA's Integration Guide requires ETag-based
//      caching (If-None-Match → 304). We honour that for the feed too.
//
// How to "activate" it: nothing to sign up for. The server polls the feed
// every GOVT_ALERTS_POLL_MIN minutes (default 10) as long as it has
// internet access to sachet.ndma.gov.in. It is a government host behind
// NIC, so it's slow (10–20 s) and sometimes times out — a failed poll keeps
// the previous live data if there was any, else falls back to the bundled
// fixture (clearly labelled `live:false` → "Offline copy" in the UI).
//
// Override the URL with GOVT_ALERTS_URL (e.g. a state SDMA CAP feed or a
// mirror); set GOVT_ALERTS_DISABLED=true to force the fixture.
import { DISTRICTS } from '../data/ner'
import fixture from './fixtures/govt-alerts.json'

export interface GovtAlert {
  id: string
  source: string          // e.g. "IMD", "CWC", "Assam SDMA"
  event: string           // e.g. "Heavy Rainfall", "Flood", "Landslide"
  headline: string
  description: string
  severity: 'high' | 'medium' | 'low'
  areaDesc: string        // free-text area from the CAP message
  districtIds: string[]   // our district ids matched from areaDesc
  issuedAt: string        // ISO
  expiresAt: string | null
  link: string | null
  live: boolean           // true = came from the real feed, false = fixture
}

export interface GovtAlertsStatus {
  live: boolean
  source: string
  fetchedAt: number | null
  lastAttemptAt: number | null
  lastError: string | null
  nextPollAt: number | null
  count: number
}

const FEED_URL = process.env.GOVT_ALERTS_URL || 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml'
const POLL_MS = Math.max(1, Number(process.env.GOVT_ALERTS_POLL_MIN) || 10) * 60 * 1000
const RETRY_MS = 2 * 60 * 1000 // after a failure, try again sooner than the full poll interval
const TIMEOUT_MS = 20_000      // NIC hosts are slow; 12 s was timing out on healthy networks
const NER_STATES = ['assam', 'meghalaya', 'manipur', 'mizoram', 'nagaland', 'tripura', 'arunachal', 'sikkim']

let cache: { alerts: GovtAlert[]; fetchedAt: number; live: boolean } | null = null
let etag: string | null = null
let lastAttemptAt: number | null = null
let lastError: string | null = null
let inflight: Promise<void> | null = null

const strip = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? strip(m[1]) : ''
}

function matchDistricts(text: string): string[] {
  const t = text.toLowerCase()
  const ids = new Set<string>()
  for (const d of DISTRICTS) {
    const names = [d.hq, d.name.replace(/\(.*\)/, '').trim(), ...d.name.match(/\(([^)]+)\)/)?.slice(1) ?? []]
    if (names.some(n => n && t.includes(n.toLowerCase()))) ids.add(d.id)
  }
  // Whole-state warning with no district named → all districts of that state.
  if (!ids.size) {
    for (const d of DISTRICTS) if (t.includes(d.state.toLowerCase()) || (d.state === 'Arunachal Pradesh' && t.includes('arunachal'))) ids.add(d.id)
  }
  return [...ids]
}

function mapSeverity(capSeverity: string, event: string, text: string): GovtAlert['severity'] {
  const s = capSeverity.toLowerCase()
  if (s.includes('extreme') || s.includes('severe')) return 'high'
  // IMD colour codes are the authoritative convention in the SACHET feed
  // (red/orange = "take action / be prepared") and can be the ONLY signal,
  // so check them before the generic CAP severity words — an "Orange alert"
  // must never be demoted to medium by a stray "Moderate" tag.
  if (/\bred (alert|warning)\b/i.test(text)) return 'high'
  if (/\borange (alert|warning)\b/i.test(text)) return 'high'
  if (s.includes('moderate')) return 'medium'
  if (s.includes('minor')) return 'low'
  if (/\byellow (alert|warning)\b/i.test(text)) return 'medium'
  if (/landslide|flood|cloud ?burst|flash|very heavy|extremely heavy/i.test(`${event} ${text}`)) return 'high'
  if (/heavy rain|thunderstorm|lightning|hail/i.test(`${event} ${text}`)) return 'medium'
  return 'low'
}

export function parseRss(xml: string): GovtAlert[] {
  const items = xml.split(/<item[\s>]/i).slice(1)
  const out: GovtAlert[] = []
  for (const raw of items) {
    const title = tag(raw, 'title')
    const description = tag(raw, 'description')
    const link = tag(raw, 'link') || null
    const pub = tag(raw, 'pubDate')
    const area = tag(raw, 'cap:areaDesc') || tag(raw, 'areaDesc') || description
    const text = `${title} ${area} ${description}`.toLowerCase()
    if (!NER_STATES.some(s => text.includes(s))) continue
    const event = tag(raw, 'cap:event') || tag(raw, 'event') || title.split(/[-:|]/)[0].trim() || 'Alert'
    const sender = tag(raw, 'cap:senderName') || tag(raw, 'senderName') || tag(raw, 'author') || tag(raw, 'dc:creator') || 'NDMA SACHET'
    const issued = tag(raw, 'cap:effective') || tag(raw, 'cap:sent') || pub
    const expires = tag(raw, 'cap:expires') || null
    const id = tag(raw, 'guid') || tag(raw, 'cap:identifier') || `${title}|${pub}`
    out.push({
      id: `GOV-${hash(id)}`,
      source: sender.replace(/\s*\(.*\)\s*$/, '').slice(0, 60),
      event: event.slice(0, 60),
      headline: title.slice(0, 160),
      description: description.slice(0, 500),
      severity: mapSeverity(tag(raw, 'cap:severity') || tag(raw, 'severity'), event, `${title} ${description}`),
      areaDesc: area.slice(0, 200),
      districtIds: matchDistricts(`${area} ${title} ${description}`),
      issuedAt: toIso(issued),
      expiresAt: expires ? toIso(expires) : null,
      link,
      live: true,
    })
  }
  return out
}

function toIso(s: string): string {
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36) }

async function fetchLive(): Promise<{ alerts: GovtAlert[]; notModified: boolean }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { 'User-Agent': 'SETU-NER/1.0 (+NER logistics platform)', Accept: 'application/rss+xml, application/xml, text/xml, */*' }
    if (etag) headers['If-None-Match'] = etag
    const res = await fetch(FEED_URL, { signal: ctrl.signal, headers })
    if (res.status === 304 && cache?.live) return { alerts: cache.alerts, notModified: true }
    if (!res.ok) throw new Error(`SACHET feed HTTP ${res.status}`)
    const xml = await res.text()
    if (!/<(rss|feed|item|alert)[\s>]/i.test(xml)) throw new Error('SACHET feed returned non-XML content')
    etag = res.headers.get('etag')
    const parsed = parseRss(xml)
    const now = Date.now()
    return { alerts: parsed.filter(a => !a.expiresAt || new Date(a.expiresAt).getTime() > now), notModified: false }
  } finally {
    clearTimeout(t)
  }
}

function fixtureAlerts(): GovtAlert[] {
  const now = Date.now()
  type FixtureAlert = Omit<GovtAlert, 'live' | 'issuedAt' | 'expiresAt' | 'districtIds' | 'severity'> & { severity: string; issuedHoursAgo: number; validHours: number }
  return (fixture.alerts as unknown as FixtureAlert[])
    .map(a => ({
      ...a,
      severity: (['high', 'medium', 'low'].includes(a.severity) ? a.severity : 'low') as GovtAlert['severity'],
      districtIds: matchDistricts(a.areaDesc),
      issuedAt: new Date(now - a.issuedHoursAgo * 3600_000).toISOString(),
      expiresAt: new Date(now + a.validHours * 3600_000).toISOString(),
      live: false,
    }))
}

async function refresh(): Promise<void> {
  lastAttemptAt = Date.now()
  if (process.env.GOVT_ALERTS_DISABLED === 'true') {
    cache = { alerts: fixtureAlerts(), fetchedAt: Date.now(), live: false }
    lastError = 'disabled via GOVT_ALERTS_DISABLED'
    return
  }
  try {
    const { alerts, notModified } = await fetchLive()
    cache = { alerts, fetchedAt: Date.now(), live: true }
    lastError = null
    if (!notModified) console.log(`[govt-alerts] SACHET feed: ${alerts.length} active NER alert(s)`)
  } catch (err) {
    lastError = (err as Error).name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (err as Error).message
    if (cache?.live) {
      // Keep serving the last real data; just mark the attempt time so the
      // next call retries after RETRY_MS instead of POLL_MS.
      console.warn(`[govt-alerts] SACHET feed unreachable (${lastError}); keeping last live data`)
      cache = { ...cache, fetchedAt: Date.now() - POLL_MS + RETRY_MS }
    } else {
      if (!cache) console.warn(`[govt-alerts] SACHET feed unreachable (${lastError}); using bundled fixture`)
      cache = { alerts: fixtureAlerts(), fetchedAt: Date.now() - POLL_MS + RETRY_MS, live: false }
    }
  }
}

export async function getGovtAlerts(): Promise<{ alerts: GovtAlert[]; live: boolean; fetchedAt: number; source: string }> {
  const stale = !cache || Date.now() - cache.fetchedAt >= POLL_MS
  if (stale) {
    // Coalesce concurrent callers (alert engine tick + HTTP requests) into
    // one upstream fetch. If we already have data, refresh in the
    // background and answer immediately with what we have.
    if (!inflight) inflight = refresh().finally(() => { inflight = null })
    if (!cache) await inflight
  }
  const c = cache!
  return { alerts: c.alerts, live: c.live, fetchedAt: c.fetchedAt, source: c.live ? FEED_URL : 'fixture' }
}

export function govtAlertsStatus(): GovtAlertsStatus {
  return {
    live: cache?.live ?? false,
    source: cache?.live ? FEED_URL : 'fixture',
    fetchedAt: cache?.fetchedAt ?? null,
    lastAttemptAt,
    lastError,
    nextPollAt: cache ? cache.fetchedAt + POLL_MS : null,
    count: cache?.alerts.length ?? 0,
  }
}

// Force a fresh poll (Alerts page "Retry live feed" button).
export async function forceRefreshGovtAlerts() {
  if (cache) cache = { ...cache, fetchedAt: 0 }
  return getGovtAlerts()
}
