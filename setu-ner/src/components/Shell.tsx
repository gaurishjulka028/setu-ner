import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home, Route, Navigation, AlertTriangle, LayoutDashboard,
  Bell, Wifi, WifiOff, Contrast, Globe, Menu, X, CloudRain, LogOut, User, ChevronDown,
  Package, Truck, MoreHorizontal, ShieldCheck,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { timeAgo } from '../lib/format'
import { Pill } from './ui'
import { canAccess } from '../lib/rbac'
import type { Role } from '../types'

// Every entry is filtered per signed-in role by navFor() below, against the
// SAME matrix as everywhere else (lib/rbac.ts's ROLE_PAGES — also used by
// App.tsx's route guards and Home.tsx's quick actions), so a user never even
// SEES a link their role can't open. There used to be a second, hand-kept
// copy of these role lists here; it's gone now so this file can't drift out
// of sync with rbac.ts (the server independently re-checks on every API call).
const NAV_ALL = [
  { to: '/', icon: Home, key: 'home' },
  { to: '/driver', icon: Truck, key: 'driver' },
  { to: '/plan-route', icon: Route, key: 'plan' },
  { to: '/track', icon: Navigation, key: 'track' },
  { to: '/report', icon: AlertTriangle, key: 'report' },
  { to: '/alerts', icon: Bell, key: 'alerts' },
  { to: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
] as const

// Secondary nav — reachable via the "More" menu on desktop, and listed
// inline alongside NAV in the mobile drawer.
const NAV_MORE_ALL = [
  { to: '/company', icon: Package, key: 'company' },
  { to: '/bookings', icon: Truck, key: 'bookings' },
  { to: '/gaps', icon: Package, key: 'gaps' },
  { to: '/verify', icon: ShieldCheck, key: 'verify' },
] as const

/** Filters the nav for the current user's role (guest → public entries). */
const navFor = (role: Role | null) => <T extends { to: string }>(items: readonly T[]) =>
  items.filter(n => canAccess(role, n.to))

function TopBar() {
  const { t, i18n } = useTranslation()
  const { online, toggleOnline, highContrast, toggleContrast, alerts, markAllAlertsRead, user, logout } = useStore()
  const [bell, setBell] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const unread = alerts.filter(a => !a.resolved && !a.read).length
  const location = useLocation()
  const role = (user?.role ?? null) as Role | null
  const NAV = navFor(role)(NAV_ALL)
  const NAV_MORE = navFor(role)(NAV_MORE_ALL)
  const moreActive = NAV_MORE.some(n => location.pathname === n.to)

  // Close any open menu/dropdown on navigation so it never sits open over
  // the next page.
  useEffect(() => { setMenuOpen(false); setMoreOpen(false); setBell(false); setLangOpen(false) }, [location.pathname])

  const langs = [
    { code: 'en', label: 'English' },
    { code: 'as', label: 'অসমীয়া' },
    { code: 'mani', label: 'ꯃꯩꯇꯩꯂꯣꯟ' },
    { code: 'kha', label: 'Khasi' },
    { code: 'lus', label: 'Mizo ṭawng' },
  ]

  return (
    <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 shadow-[0_2px_14px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
      <Link to="/" className="flex shrink-0 items-center gap-2.5 mr-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark text-sm font-black text-white shadow-brand">SN</div>
        <div className="leading-none">
          <div className="text-[15px] font-extrabold tracking-tight text-main">SETU<span className="text-primary">-NER</span></div>
          <div className="hidden text-[9px] font-medium text-slate-500 sm:block">Smart logistics for the North East</div>
        </div>
      </Link>

      <nav className="hidden flex-1 items-center justify-center gap-0.5 lg:flex" aria-label="Primary navigation">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) => `relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition after:absolute after:left-3 after:right-3 after:-bottom-[1px] after:h-[2px] after:rounded-full after:bg-accent after:transition-transform after:duration-200 ${isActive ? 'text-primary after:scale-x-100' : 'text-slate-600 hover:bg-slate-50 hover:text-main after:scale-x-0'}`}>
            <n.icon size={15} strokeWidth={2.2} /> {t(`nav.${n.key}`)}
          </NavLink>
        ))}
        {NAV_MORE.length > 0 && <div className="relative">
          <button onClick={() => setMoreOpen(o => !o)} aria-haspopup="true" aria-expanded={moreOpen}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${moreActive ? 'bg-primary-light text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-main'}`}>
            <MoreHorizontal size={15} strokeWidth={2.2} /> {t('nav.more')} <ChevronDown size={12} className={`transition ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          {moreOpen && (
            <div className="absolute left-0 top-12 z-[1200] w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-panel">
              {NAV_MORE.map(n => (
                <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2.5 px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-primary-light text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-main'}`}>
                  <n.icon size={15} /> {t(`nav.${n.key}`)}
                </NavLink>
              ))}
            </div>
          )}
        </div>}
      </nav>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
      {/* connectivity (manual toggle — simulates going offline in the field) */}
      <button onClick={toggleOnline}
        title="Toggle connectivity to demo offline mode"
        aria-label={online ? t('online') : t('offline')}
        className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition sm:flex ${online ? 'text-secondary hover:bg-secondary-light' : 'bg-hazard text-white animate-pulse'}`}>
        {online ? <Wifi size={15} /> : <WifiOff size={15} />}
        <span className="hidden xl:inline">{online ? t('online') : t('offline')}</span>
      </button>

      {/* language */}
      <div className="relative">
        <button onClick={() => setLangOpen(o => !o)} aria-label="Language" className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-main">
          <Globe size={16} /> <span className="hidden xl:inline">{langs.find(l => l.code === i18n.language)?.label ?? 'English'}</span><ChevronDown size={13} className="hidden sm:block" />
        </button>
        {langOpen && (
          <div className="absolute right-0 top-12 z-[1200] w-40 rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-panel">
            {langs.map(l => (
              <button key={l.code} onClick={() => { i18n.changeLanguage(l.code); setLangOpen(false) }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${i18n.language === l.code ? 'font-bold text-primary' : ''}`}>
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* high contrast */}
      <button onClick={toggleContrast} title="High-contrast mode"
        aria-label="Toggle high contrast mode"
        className={`hidden rounded-lg p-2 transition hover:bg-slate-50 sm:block ${highContrast ? 'bg-accent text-white hover:bg-accent' : 'text-slate-500'}`}>
        <Contrast size={16} />
      </button>

      {/* notifications */}
      <div className="relative">
        <button onClick={() => { setBell(o => !o); if (!bell) setTimeout(markAllAlertsRead, 800) }}
          aria-label={`${t('notif.title')}${unread > 0 ? `, ${unread} unread` : ''}`} aria-expanded={bell}
          className="relative min-h-10 rounded-lg p-2 text-slate-600 transition hover:bg-slate-50 hover:text-main">
          <Bell size={16} />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 bg-hazard text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
        </button>
        {bell && (
          <div className="absolute right-0 top-11 w-80 max-w-[90vw] bg-white rounded-xl shadow-panel border border-slate-200 z-[1200] overflow-hidden">
            <div className="px-4 py-2.5 bg-secondary-light text-secondary text-xs font-bold flex justify-between">
              {t('notif.title')}
              <button onClick={() => setBell(false)} aria-label="Close notifications" className="rounded-lg p-1 hover:bg-white/60"><X size={14} /></button>
            </div>
            <div className="max-h-96 overflow-auto thin-scroll">
              {alerts.slice(0, 15).map(a => (
                <div key={a.id} className="px-4 py-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Pill tone={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'amber' : 'blue'}>{a.type}</Pill>
                    <span className="text-[10px] text-slate-400">{timeAgo(a.time)}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-slate-800 mt-1">{a.title}</div>
                  <div className="text-[11px] text-slate-500">{a.message}</div>
                </div>
              ))}
            </div>
            <Link to="/notifications" onClick={() => setBell(false)} className="block text-center py-2 text-xs font-bold text-primary bg-slate-50">
              {t('alerts.title')} →
            </Link>
          </div>
        )}
      </div>

      {/* user */}
      {user ? (
        <div className="hidden items-center gap-2 border-l border-slate-200 pl-2 sm:flex">
          <Link to="/" className="flex items-center gap-2" title={`${user.name} · ${t(`auth.${user.role}`)}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light text-xs font-bold text-primary">
              {user.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
            <span className="hidden xl:inline"><Pill tone={ROLE_TONE[user.role] ?? 'slate'}>{t(`auth.${user.role}`)}</Pill></span>
          </Link>
          <button onClick={logout} title={t('auth.logout')} aria-label={t('auth.logout')} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-main"><LogOut size={15} /></button>
        </div>
      ) : (
        <Link to="/login" className="hidden items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-brand transition hover:bg-primary-dark sm:flex">
          <User size={14} /> <span className="hidden xl:inline">{t('auth.login')}</span>
        </Link>
      )}

      <button onClick={() => setMenuOpen(o => !o)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-50 lg:hidden">
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      </div>
      </div>
      {menuOpen && (
        <nav className="border-t border-slate-100 bg-white px-4 py-3 shadow-sm lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-[1440px] gap-1 sm:grid-cols-2">
            {[...NAV, ...NAV_MORE].map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-primary-light text-primary' : 'text-slate-600 hover:bg-slate-50'}`}>
                <n.icon size={17} /> {t(`nav.${n.key}`)}
              </NavLink>
            ))}
            <button onClick={toggleOnline} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-secondary hover:bg-secondary-light sm:col-span-2">
              {online ? <Wifi size={17} /> : <WifiOff size={17} />} {online ? t('online') : t('offline')}
            </button>
          </div>
        </nav>
      )}
    </header>
  )
}

// Readable, length-independent scroll speed for the marquee: the animation
// always travels one copy's rendered width (content is duplicated for a
// seamless loop, and the CSS keyframe moves it exactly -50%), so dividing
// that width by a fixed px/second speed gives short and long alert lists
// the same reading pace instead of both taking a fixed 30s.
const TICKER_PX_PER_SEC = 68
const TICKER_MIN_DURATION = 10
const TICKER_MAX_DURATION = 60

function HazardStrip() {
  const { t, i18n } = useTranslation()
  const { alerts, online, lastSync, disasterMode } = useStore()
  const trackRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(TICKER_MIN_DURATION)
  const high = alerts.filter(a => !a.resolved && a.severity === 'high')
  const items = useMemo(() => {
    if (disasterMode) return ['🚨 ' + t('disaster.active')]
    if (high.length) return high.map(a => `⚠️ ${a.title} — ${a.action}`)
    return null
  }, [high, disasterMode, t, i18n.language])

  useEffect(() => {
    if (!items || !trackRef.current) return
    const measure = () => {
      const el = trackRef.current
      if (!el) return
      const oneSetWidth = el.scrollWidth / 2 // content is rendered twice, back-to-back
      const next = Math.min(TICKER_MAX_DURATION, Math.max(TICKER_MIN_DURATION, oneSetWidth / TICKER_PX_PER_SEC))
      setDuration(next)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [items, i18n.language])

  if (!items) {
    if (!online) {
      // Connectivity state, not a hazard — kept visually distinct (slate/
      // secondary, no urgent red) from genuine high-severity alerts below.
      return (
        <div className="relative z-[1000] flex items-center gap-2 bg-secondary-dark px-4 py-1.5 text-xs font-semibold text-white">
          <WifiOff size={13} className="shrink-0" />
          <span className="leading-none">{t('offline')}</span>
          {lastSync && <span className="leading-none text-white/70">· {t('lastSync')} {timeAgo(lastSync)}</span>}
        </div>
      )
    }
    return null
  }

  return (
    <div
      className="ticker-strip contour-field relative z-[1000] flex items-center overflow-hidden bg-hazard py-1.5 text-xs font-semibold text-white"
      tabIndex={0}
      aria-label={`${t('alerts.title')} — pause on hover or focus`}
    >
      <CloudRain size={14} className="flex shrink-0 items-center self-center mx-2" />
      <div className="ticker-viewport min-w-0 flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="ticker flex w-max items-center whitespace-nowrap"
          style={{ '--ticker-duration': `${duration}s` } as CSSProperties}
        >
          {[...items, ...items].map((s, i) => <span key={i} className="flex items-center px-8 leading-none">{s}</span>)}
        </div>
      </div>
      {!online && (
        <span className="ml-auto mr-2 flex shrink-0 items-center gap-1 rounded bg-secondary-dark px-2 py-0.5 leading-none">
          <WifiOff size={10} /> {t('offline')}
        </span>
      )}
    </div>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { highContrast } = useStore()
  return (
    <div className={`h-full flex flex-col ${highContrast ? 'hc' : ''}`}>
      <TopBar />
      <HazardStrip />
      <main className="page-transition min-h-0 flex-1 overflow-auto thin-scroll">
        {children}
      </main>
    </div>
  )
}

// Role → badge colour in the user chip (mirrors lib/rbac.ts tones).
const ROLE_TONE: Record<string, 'blue' | 'green' | 'amber' | 'red' | 'slate'> = {
  citizen: 'green', operator: 'amber', logistics: 'blue', official: 'red', admin: 'slate',
}
