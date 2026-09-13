import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastTone = 'error' | 'info' | 'success'
type ToastItem = { id: number; message: string; tone: ToastTone }

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 4000

// Tone → design tokens, reusing the same bg/-light + text pairing Pill and
// statusPill already use elsewhere, so a toast reads as part of the app
// rather than a bolted-on library default.
const TONE_STYLES: Record<ToastTone, { bg: string; border: string; text: string; icon: ReactNode }> = {
  error: { bg: 'bg-hazard-light', border: 'border-hazard/20', text: 'text-hazard', icon: <AlertCircle size={18} /> },
  info: { bg: 'bg-secondary-light', border: 'border-secondary/20', text: 'text-secondary', icon: <Info size={18} /> },
  success: { bg: 'bg-success-light', border: 'border-success/20', text: 'text-success', icon: <CheckCircle2 size={18} /> },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setToasts(t => [...t, { id, message, tone }])
    window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* top-right, below the sticky header — the chatbot launcher and the
          mobile offline banner both live at the bottom of the viewport, so
          this corner keeps toasts from ever stacking on top of either. */}
      <div className="fixed top-20 right-4 z-[1250] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const s = TONE_STYLES[t.tone]
          return (
            <div key={t.id} role="alert"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border ${s.bg} ${s.border} px-3.5 py-3 shadow-panel slide-in`}>
              <div className={`shrink-0 mt-0.5 ${s.text}`}>{s.icon}</div>
              <div className="flex-1 text-sm font-semibold text-slate-800">{t.message}</div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification"
                className="shrink-0 text-slate-400 transition hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
