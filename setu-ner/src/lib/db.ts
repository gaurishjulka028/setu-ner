// ── IndexedDB (idb) for offline cache + queued field reports ───────────────
// Part 3 step 5: same idb layer, repurposed — reports/alerts/bookings
// stores now cache API results for offline viewing (populated from server
// responses in useStore.ts, not the only copy of the data), and the new
// `outbox` store queues field reports created while offline so they can be
// flushed to POST /api/reports automatically on reconnect.
import { openDB, type IDBPDatabase } from 'idb'
import type { IncidentReport, AlertItem, WeatherPoint, Snapshot, Booking } from '../types'

const DB_NAME = 'setu-ner'
const DB_VERSION = 2
const STORES = ['kv', 'reports', 'alerts', 'bookings', 'outbox'] as const
type StoreName = typeof STORES[number]

// Minimal subset of the IDBPDatabase surface this file actually calls —
// used both by the real idb wrapper and by the in-memory fallback below, so
// db() can return either one behind a single type.
interface MiniDB {
  get(store: StoreName, key: IDBValidKey): Promise<unknown>
  put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<unknown>
  getAll(store: StoreName): Promise<unknown[]>
  delete(store: StoreName, key: IDBValidKey): Promise<void>
  transaction(store: StoreName, mode: 'readwrite'): { store: { put(value: unknown): Promise<unknown> }; done: Promise<void> }
}

// Some hosting/preview sandboxes (embedded iframes with a restrictive
// `sandbox` attribute, certain private-browsing modes, older in-app
// WebViews) block or omit IndexedDB entirely. openDB() then throws or
// rejects, and — because the original code never guarded this — every
// caller (reportsStore.all(), alertsStore.all(), bookingsStore.all(), all
// awaited together in useStore.ts's init()) rejected too, as an *unhandled*
// promise rejection that silently aborted the rest of init() (socket wireup,
// weather refresh, `initialLoad` flip). This fallback keeps every page
// working — just without persistent offline cache — instead of quietly
// breaking first-load data wiring on those hosts.
function makeMemoryDB(): MiniDB {
  const tables = new Map<StoreName, Map<IDBValidKey, unknown>>(STORES.map(s => [s, new Map()]))
  const keyPathOf: Partial<Record<StoreName, string>> = { reports: 'id', alerts: 'id', bookings: 'id', outbox: 'localId' }
  return {
    async get(store, key) { return tables.get(store)?.get(key) },
    async put(store, value, key) {
      const kp = keyPathOf[store]
      const k = key ?? (kp ? (value as Record<string, IDBValidKey>)[kp] : undefined)
      tables.get(store)!.set(k as IDBValidKey, value)
      return k
    },
    async getAll(store) { return Array.from(tables.get(store)?.values() ?? []) },
    async delete(store, key) { tables.get(store)?.delete(key) },
    transaction(store) {
      const self = this as unknown as MiniDB
      return { store: { put: (value: unknown) => self.put(store, value) }, done: Promise.resolve() }
    },
  }
}

let dbp: Promise<MiniDB> | null = null
function db(): Promise<MiniDB> {
  if (!dbp) {
    if (typeof indexedDB === 'undefined') {
      dbp = Promise.resolve(makeMemoryDB())
    } else {
      dbp = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
          if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'id' })
          if (!db.objectStoreNames.contains('alerts')) db.createObjectStore('alerts', { keyPath: 'id' })
          if (!db.objectStoreNames.contains('bookings')) db.createObjectStore('bookings', { keyPath: 'id' })
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'localId' })
        },
      }).then(real => real as unknown as MiniDB, () => makeMemoryDB())
    }
  }
  return dbp
}

export const kv = {
  async get<T>(key: string): Promise<T | undefined> { return (await db()).get('kv', key) as Promise<T | undefined> },
  async set(key: string, val: unknown) { await (await db()).put('kv', val, key) },
}

export const reportsStore = {
  async all(): Promise<IncidentReport[]> { return (await db()).getAll('reports') as Promise<IncidentReport[]> },
  async put(r: IncidentReport) { await (await db()).put('reports', r) },
  async bulk(rs: IncidentReport[]) {
    const tx = (await db()).transaction('reports', 'readwrite')
    await Promise.all(rs.map(r => tx.store.put(r)))
    await tx.done
  },
  async remove(id: string) { await (await db()).delete('reports', id) },
}

export const alertsStore = {
  async all(): Promise<AlertItem[]> { return (await db()).getAll('alerts') as Promise<AlertItem[]> },
  async bulk(as: AlertItem[]) {
    const tx = (await db()).transaction('alerts', 'readwrite')
    await Promise.all(as.map(a => tx.store.put(a)))
    await tx.done
  },
}

export const bookingsStore = {
  async all(): Promise<Booking[]> { return (await db()).getAll('bookings') as Promise<Booking[]> },
  async bulk(bs: Booking[]) {
    const tx = (await db()).transaction('bookings', 'readwrite')
    await Promise.all(bs.map(b => tx.store.put(b)))
    await tx.done
  },
  async put(b: Booking) { await (await db()).put('bookings', b) },
}

export interface CachedData {
  weather: Record<string, WeatherPoint>
  snapshots: Snapshot[]
  syncedAt: number
}

export async function saveCache(data: CachedData) {
  await kv.set('cache', data)
}
export async function loadCache(): Promise<CachedData | undefined> {
  return kv.get<CachedData>('cache')
}

// ── Outbox: field reports created while offline, queued here until the
// backend is reachable again. Payload matches exactly what POST
// /api/reports expects (see addReport() in useStore.ts).
export type ReportPayload = Omit<IncidentReport, 'id' | 'createdAt' | 'synced' | 'status' | 'confidence' | 'points' | 'reporter' | 'reporterRole'>

export interface OutboxReport {
  localId: string
  payload: ReportPayload
  queuedAt: number
}

export const outboxStore = {
  async all(): Promise<OutboxReport[]> { return (await db()).getAll('outbox') as Promise<OutboxReport[]> },
  async add(item: OutboxReport) { await (await db()).put('outbox', item) },
  async remove(localId: string) { await (await db()).delete('outbox', localId) },
}
