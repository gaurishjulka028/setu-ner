import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // transition-shadow is a no-op unless a hover/focus variant is also
  // supplied on a given instance — safe to apply everywhere so any card
  // that *does* add a hover state (Home.tsx activity rows, quick actions,
  // etc.) animates smoothly instead of the shadow snapping in.
  // border-slate-200/80 + the card shadow token together give a slightly
  // deeper, more deliberate "instrument panel" edge than a flat 1px grey
  // line on a flat shadow — the shared depth treatment every page inherits.
  return <div className={`bg-white rounded-2xl shadow-card border border-slate-200/80 transition-shadow duration-200 hc-card ${className}`}>{children}</div>
}

export function SectionTitle({ icon, title, sub, right }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        {icon && <div className="w-9 h-9 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/10">{icon}</div>}
        <div>
          <h2 className="text-[15px] font-extrabold tracking-tight text-main leading-tight">{title}</h2>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

export function Pill({ tone = 'slate', children }: { tone?: 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'orange'; children: ReactNode }) {
  const tones: Record<string, string> = {
    green: 'bg-success-light text-success',
    red: 'bg-hazard-light text-hazard',
    amber: 'bg-caution-light text-caution-text',
    blue: 'bg-secondary-light text-secondary',
    orange: 'bg-accent-light text-accent-text',
    slate: 'bg-slate-100 text-slate-600',
  }
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>
}

export function statusPill(status: string) {
  if (status === 'open' || status === 'moving' || status === 'verified' || status === 'delivered') return <Pill tone="green">● {status}</Pill>
  if (status === 'caution' || status === 'delayed' || status === 'partial' || status === 'pending' || status === 'in_transit') return <Pill tone="amber">▲ {status.replace('_', ' ')}</Pill>
  if (status === 'blocked' || status === 'halted' || status === 'impassable' || status === 'rejected') return <Pill tone="red">■ {status}</Pill>
  return <Pill tone="slate">{status.replace('_', ' ')}</Pill>
}

export function Button({ children, onClick, variant = 'primary', className = '', type = 'button', disabled, 'aria-label': ariaLabel }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'accent' | 'hazard' | 'ghost'; className?: string; type?: 'button' | 'submit'; disabled?: boolean; 'aria-label'?: string
}) {
  // Buttons use a tighter radius (rounded-lg) than cards/panels (rounded-2xl)
  // and pills (fully round) — a deliberate three-step radius scale rather
  // than one border-radius applied everywhere. active:scale gives buttons a
  // tactile "press" independent of the hover shadow lift.
  const v: Record<string, string> = {
    primary: 'bg-primary text-white shadow-brand hover:bg-primary-dark',
    secondary: 'bg-secondary text-white shadow-sm hover:bg-secondary-dark hover:shadow',
    accent: 'bg-accent text-white shadow-sm hover:brightness-95 hover:shadow',
    hazard: 'bg-hazard text-white shadow-sm hover:brightness-90 hover:shadow',
    ghost: 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${v[variant]} ${className}`}>
      {children}
    </button>
  )
}

export function Kpi({ icon, label, value, sub, tone = 'primary' }: { icon: ReactNode; label: string; value: string | number; sub?: string; tone?: 'primary' | 'secondary' | 'green' | 'red' | 'accent' }) {
  const tones: Record<string, string> = {
    primary: 'bg-primary-light text-primary',
    secondary: 'bg-secondary-light text-secondary',
    green: 'bg-success-light text-success',
    red: 'bg-hazard-light text-hazard',
    accent: 'bg-accent-light text-accent-text',
  }
  const bars: Record<string, string> = {
    primary: 'bg-primary', secondary: 'bg-secondary', green: 'bg-success', red: 'bg-hazard', accent: 'bg-accent',
  }
  return (
    <Card className="relative overflow-hidden p-4">
      {/* thin tone-matched edge — a quieter, more considered stand-in for a
         full coloured card background, kept consistent across every Kpi */}
      <span className={`absolute inset-y-0 left-0 w-1 ${bars[tone]}`} aria-hidden />
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones[tone]}`}>{icon}</div>
        <div>
          <div className="text-[28px] font-extrabold tracking-tightest text-main leading-none tabular-nums">{value}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-1.5">{label}</div>
        </div>
      </div>
      {sub && <p className="text-xs text-slate-500 mt-2">{sub}</p>}
    </Card>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={on} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      <span className={`w-9 h-5 rounded-full relative transition ${on ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-4.5' : 'left-0.5'}`} style={{ left: on ? 18 : 2 }} />
      </span>
      {label}
    </button>
  )
}

// ── Loading skeletons ────────────────────────────────────────────────────
// Neutral gray, pulsing placeholders — deliberately colorless so they never
// read as a status (green/red/amber keep their exact existing meaning).

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

/** Mirrors the exact shape of <Kpi>: icon square + value + label, in a Card. */
export function KpiSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </Card>
  )
}

/** A single list-row placeholder — used for report/alert/booking/vehicle
 * cards, which all share the same "title + a couple of detail lines" shape. */
export function RowSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-2 space-y-1.5">
        {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-3/4'}`} />)}
      </div>
    </Card>
  )
}

/** A generic content-card placeholder (charts, panels, map cards) —
 * a title bar plus a block of the given height. */
export function CardSkeleton({ height = 'h-40', lines }: { height?: string; lines?: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
        <Skeleton className="h-4 w-32" />
      </div>
      {lines ? (
        <div className="space-y-2.5">
          {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className="h-3 w-full" />)}
        </div>
      ) : (
        <Skeleton className={`w-full ${height}`} />
      )}
    </Card>
  )
}

// ── Empty states ─────────────────────────────────────────────────────────
// A designed placeholder for "genuinely nothing to show" — not a blank div.

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      {icon && <div className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400">{icon}</div>}
      <div className="text-sm font-bold text-slate-600">{title}</div>
      {body && <p className="max-w-xs text-xs text-slate-400">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
