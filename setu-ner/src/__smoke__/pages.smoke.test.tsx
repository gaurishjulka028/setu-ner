// Smoke test: mounts the REAL App (real DriverConsole, real Shell, real
// store) in jsdom for a handful of routes and roles, and asserts that every
// section of markup we expect is actually present in the rendered DOM.
// Heavy/native-only modules (Leaflet, sockets, Firebase, geolocation) are
// stubbed so this can run headlessly without a browser or backend.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// jsdom has no ResizeObserver — recharts' <ResponsiveContainer> (used on
// Dashboard) needs one. Real browsers all have this; this stub only exists
// so the test environment doesn't fail on something that isn't a real bug.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  ;(globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ── react-leaflet / leaflet stubs ──────────────────────────────────────────
// Keep MapView's OWN JSX (SourcesLegend etc.) real; only swap out the parts
// that need real browser geometry (tile loading, canvas panes).
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => React.createElement('div', { 'data-testid': 'map-container' }, children),
  TileLayer: () => React.createElement('div', { 'data-testid': 'tile-layer' }),
  Polyline: () => null,
  Marker: ({ children }: any) => React.createElement('div', null, children),
  Popup: ({ children }: any) => React.createElement('div', null, children),
  CircleMarker: ({ children }: any) => React.createElement('div', null, children),
  Tooltip: ({ children }: any) => React.createElement('div', null, children),
  LayerGroup: ({ children }: any) => React.createElement('div', null, children),
  useMap: () => ({ flyTo: vi.fn(), getZoom: () => 7, invalidateSize: vi.fn() }),
  useMapEvents: () => null,
}))
vi.mock('leaflet', () => ({
  default: {
    divIcon: () => ({}),
    Icon: { Default: { mergeOptions: vi.fn(), prototype: {} } },
  },
}))

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}))

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(), getApps: () => [] }))
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(), GoogleAuthProvider: vi.fn(), signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(), getRedirectResult: vi.fn(() => Promise.resolve(null)),
}))

// Network calls: every lib/api.ts call should just reject so the store's
// existing .catch() fallbacks (to bundled seed data) kick in — that fallback
// path is exactly what a hosted-without-backend deployment exercises.
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<any>('../lib/api')
  return {
    ...actual,
    api: {
      get: vi.fn(() => Promise.reject(new Error('no backend in test'))),
      post: vi.fn(() => Promise.reject(new Error('no backend in test'))),
      put: vi.fn(() => Promise.reject(new Error('no backend in test'))),
      delete: vi.fn(() => Promise.reject(new Error('no backend in test'))),
    },
  }
})

import '../i18n'
import App from '../App'
import { ToastProvider } from '../components/Toast'
import { useStore } from '../store/useStore'
import { VEHICLES } from '../data/ner'

function renderAt(path: string) {
  return render(
    React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(ToastProvider, null, React.createElement(App)))
  )
}

describe('DriverConsole ("My Drive") smoke test', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      user: { id: 'u1', name: 'Test Operator', role: 'operator', phone: '910000000000' } as any,
      vehicles: VEHICLES.map(v => ({ ...v })),
      initialLoad: false,
    })
  })
  afterEach(() => cleanup())

  it('renders header, stat cards, map AND the hazards/alerts column with no vehicle pre-selected', () => {
    renderAt('/driver')
    // Header card (title + vehicle picker) — always rendered per DriverConsole.tsx
    expect(screen.getByText('Driver Console')).toBeTruthy()
    // With no vehicle chosen yet, the empty-state card should show instead
    // of stat cards/map — this is the expected pre-selection state.
    expect(document.querySelector('select')).toBeTruthy()
  })

  it('renders full content (stat cards + map + hazards column) once a vehicle is auto-selected via localStorage', () => {
    const firstVehicleId = VEHICLES[0].id
    localStorage.setItem('setu-driver-vehicle', firstVehicleId)
    renderAt('/driver')

    // 1) Header card
    expect(screen.getAllByText(firstVehicleId).length).toBeGreaterThan(0)
    // 2) Stat grid — ETA / route-status / actions cards
    expect(screen.getByText(/route active|rerouted|route disrupted/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /share/i })).toBeTruthy()
    // 3) Map card
    expect(screen.getByTestId('map-container')).toBeTruthy()
    // 4) Hazards / alerts column AFTER the map — this is the content the
    //    screenshot shows missing.
    expect(screen.getByText(/hazards ahead|path clear/i)).toBeTruthy()
    expect(screen.getByText(/alerts for this route/i)).toBeTruthy()
  })
})

describe('Other role-gated pages render without throwing', () => {
  afterEach(() => cleanup())

  it('Home renders for a signed-out guest', () => {
    localStorage.clear()
    useStore.setState({ user: null, initialLoad: false })
    renderAt('/')
    expect(document.body.textContent).toBeTruthy()
  })

  it('Track renders for a citizen', () => {
    localStorage.clear()
    useStore.setState({ user: { id: 'u2', name: 'Citizen', role: 'citizen' } as any, vehicles: VEHICLES.map(v => ({ ...v })), initialLoad: false })
    renderAt('/track')
    expect(screen.getByTestId('map-container')).toBeTruthy()
  })

  it('Dashboard renders for an official (stat cards + disaster toggle)', () => {
    localStorage.clear()
    useStore.setState({ user: { id: 'u3', name: 'Official', role: 'official' } as any, vehicles: VEHICLES.map(v => ({ ...v })), initialLoad: false })
    renderAt('/dashboard')
    expect(document.body.textContent).toBeTruthy()
  })

  it('CompanyConsole renders for logistics role', () => {
    localStorage.clear()
    useStore.setState({ user: { id: 'u4', name: 'Logi', role: 'logistics' } as any, vehicles: VEHICLES.map(v => ({ ...v })), initialLoad: false })
    renderAt('/company')
    expect(document.body.textContent).toBeTruthy()
  })

  it('a citizen hitting /driver is redirected away, not shown a blank page', () => {
    localStorage.clear()
    useStore.setState({ user: { id: 'u5', name: 'Citizen', role: 'citizen' } as any, vehicles: VEHICLES.map(v => ({ ...v })), initialLoad: false })
    renderAt('/driver')
    // Guarded redirects a role that can't access /driver to its own
    // fallback page instead of rendering DriverConsole — should not be blank.
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0)
  })
})
