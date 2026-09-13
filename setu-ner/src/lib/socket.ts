// ── Socket.IO client for /ws/vehicles (Part 3 step 3) ────────────────────
// Replaces the client-side tick() simulation: one shared connection per
// tab, subscribed to the same server-pushed 'vehicles:update' event so
// every open tab shows identical, server-authoritative positions.
import { io, type Socket } from 'socket.io-client'
import { API_ORIGIN } from './api'

let socket: Socket | null = null

export function getVehicleSocket(): Socket {
  if (!socket) {
    // API_ORIGIN is '' when the app is served through the Vite proxy
    // (non-localhost host) — io() then connects same-origin and the dev
    // server proxies /ws/vehicles through to the backend with ws: true.
    socket = io(API_ORIGIN || undefined, {
      path: '/ws/vehicles',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    })
  }
  return socket
}
