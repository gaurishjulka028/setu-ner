// ── Backend API client (Part 3) ──────────────────────────────────────────
// Every call the frontend makes to the Express/Prisma backend goes through
// here: base URL, JSON headers, and attaching the JWT from login.
//
// Token storage note: the frontend (Vite dev server) and the API (Express)
// run as two separate origins in dev, so an httpOnly cookie set by the API
// wouldn't be readable/attachable the simple way without extra proxy/cookie
// config. Per the brief's fallback ("otherwise secure storage"), the token
// is kept in localStorage next to the existing 'setu-user' entry. It's sent
// as a normal Bearer header, same as the curl examples in server/README.md.
//
// Base URL: VITE_API_URL wins when set. Otherwise, when the page is served
// from localhost the API is assumed to be at http://localhost:4000 (the
// classic `cd server && npm run dev` setup); when the page is served from
// any other host (Vite dev/preview proxy, hosted demo), calls go
// same-origin and the dev server proxies /api, /uploads and /ws/vehicles
// through to the backend (see vite.config.ts).
const LOCAL_API = 'http://localhost:4000'

function defaultApiBase(): string {
  if (typeof window === 'undefined') return LOCAL_API
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' ? LOCAL_API : ''
}

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? defaultApiBase()).replace(/\/+$/, '')

const TOKEN_KEY = 'setu-token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* storage unavailable — proceed unauthenticated */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
}

class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.body = body ?? {}
  }
}

// Called when a request that carried a token comes back 401 — the token is
// expired/invalid (JWT_EXPIRES_IN, server restarted with a new secret…).
// The store registers a handler that clears the session so the UI doesn't
// keep showing a logged-in user whose every request silently fails. The
// handler also receives the token the failed request actually used, so it
// can ignore a 401 that arrived after a newer login replaced the token.
let onUnauthorized: ((reason: string, rejectedToken: string | null) => void) | null = null
export function setUnauthorizedHandler(fn: ((reason: string, rejectedToken: string | null) => void) | null) { onUnauthorized = fn }

// Decode the JWT payload (no verification — purely to explain to the user
// WHY the server said 401: expired vs. signed by a different server).
export function describeTokenProblem(token: string | null): string {
  if (!token) return 'You were signed out.'
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    if (payload.exp && payload.exp * 1000 < Date.now()) return 'Your session expired (sign-ins last 8 hours). Please sign in again.'
    return 'The API server rejected your session — it was probably restarted with a different JWT_SECRET (server/.env), or you signed in against another server. Please sign in again.'
  } catch {
    return 'Your session is no longer valid. Please sign in again.'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError('Cannot reach the SETU-NER API server', 0)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.status === 401 && token && !path.startsWith('/api/auth/login')) onUnauthorized?.(describeTokenProblem(token), token)
    throw new ApiError((body.error as string) || `Request failed (${res.status})`, res.status, body)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = void>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'DELETE' }),
  // Multipart upload (photo etc.) — fetch sets the multipart boundary itself.
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
}

export const API_ORIGIN = API_BASE
export { ApiError }

// Turn a stored server photo path (e.g. '/uploads/photos/P-xxx.jpg') into a
// fully loadable URL. Absolute URLs (S3-style, future) pass through as-is.
export function mediaUrl(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${API_BASE}${pathOrUrl}`
}
