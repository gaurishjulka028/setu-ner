import { useEffect, type ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Shell from './components/Shell'
import Chatbot from './components/Chatbot'
import LanguageTextOverlay from './components/LanguageTextOverlay'
import { useStore } from './store/useStore'
import { canAccess } from './lib/rbac'

import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PlanRoute from './pages/PlanRoute'
import Track from './pages/Track'
import Report from './pages/Report'
import Alerts from './pages/Alerts'
import Bookings from './pages/Bookings'
import Gaps from './pages/Gaps'
import Disaster from './pages/Disaster'
import Notifications from './pages/Notifications'
import Help from './pages/Help'
import DriverConsole from './pages/DriverConsole'
import CompanyConsole from './pages/CompanyConsole'
import VerifyQueue from './pages/VerifyQueue'

/**
 * Role-based route guard — the UI half of RBAC (lib/rbac.ts is the matrix).
 *  • not signed in   → /login (with ?next= to come back)
 *  • wrong role      → redirected to the first page their role CAN open, so a
 *                      citizen deep-linking /dashboard lands on Home instead
 *                      of a dead end. The server independently enforces the
 *                      same rules on every API call (requireRole).
 */
function Guarded({ children, path, roles }: { children: ReactNode; path: string; roles?: string[] }) {
  const user = useStore(s => s.user)
  const loc = useLocation()
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  const allowed = (roles ?? (['citizen', 'operator', 'logistics', 'official', 'admin'] as string[]))
  if (!allowed.includes(user.role) || !canAccess(user.role, path)) {
    const fallback = canAccess(user.role, '/dashboard') ? '/dashboard'
      : canAccess(user.role, '/driver') ? '/driver'
        : canAccess(user.role, '/company') ? '/company'
          : '/'
    return <Navigate to={fallback} replace />
  }
  return children
}

export default function App() {
  const { init, online, setOnline } = useStore()

  useEffect(() => { init() }, [])
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  return (
    <Shell>
      <LanguageTextOverlay />
      <Routes>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/track" element={<Track />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/help" element={<Help />} />

        {/* citizen + field roles */}
        <Route path="/report" element={<Guarded path="/report" roles={['citizen', 'operator', 'official', 'admin']}><Report /></Guarded>} />

        {/* driver */}
        <Route path="/driver" element={<Guarded path="/driver" roles={['operator', 'admin']}><DriverConsole /></Guarded>} />

        {/* company */}
        <Route path="/company" element={<Guarded path="/company" roles={['logistics', 'admin']}><CompanyConsole /></Guarded>} />
        <Route path="/bookings" element={<Guarded path="/bookings" roles={['logistics', 'official', 'admin']}><Bookings /></Guarded>} />
        <Route path="/gaps" element={<Guarded path="/gaps" roles={['logistics', 'official', 'admin']}><Gaps /></Guarded>} />

        {/* officials / admins */}
        <Route path="/dashboard" element={<Guarded path="/dashboard" roles={['official', 'admin']}><Dashboard /></Guarded>} />
        <Route path="/verify" element={<Guarded path="/verify" roles={['official', 'admin']}><VerifyQueue /></Guarded>} />
        <Route path="/disaster" element={<Guarded path="/disaster" roles={['official', 'admin']}><Disaster /></Guarded>} />

        {/* shared operational planning */}
        <Route path="/plan-route" element={<Guarded path="/plan-route" roles={['operator', 'logistics', 'official', 'admin']}><PlanRoute /></Guarded>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Chatbot />
      {!online && (
        <div className="md:hidden fixed bottom-16 inset-x-0 z-[1040]">
          {/* Connectivity state, not a hazard — kept visually distinct from
              genuine high-severity alerts (see HazardStrip in Shell.tsx). */}
          <div className="bg-secondary-dark/95 text-white text-[11px] font-bold text-center py-1">
            OFFLINE — reports queued, map cached
          </div>
        </div>
      )}
    </Shell>
  )
}
