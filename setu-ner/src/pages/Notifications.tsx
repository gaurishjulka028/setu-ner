import { useTranslation } from 'react-i18next'
import { Bell, BellOff } from 'lucide-react'
import { Card, SectionTitle, Button, Pill, EmptyState } from '../components/ui'
import WhatsAppPanel from '../components/WhatsAppPanel'
import { useStore } from '../store/useStore'
import { timeAgo } from '../lib/format'

// Who may see the dispatch outbox: operational roles only. The outbox
// contains requisitions, booking details and phone numbers — not public
// information (the API endpoint will get the same guard next).
const WA_PANEL_ROLES = ['official', 'admin', 'logistics', 'operator']

export default function Notifications() {
  const { t } = useTranslation()
  const { alerts, markAllAlertsRead, user } = useStore()
  const activeAlerts = alerts.filter(alert => !alert.resolved)
  const showWaPanel = !!user && WA_PANEL_ROLES.includes(user.role)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      {showWaPanel && <WhatsAppPanel />}
      <Card className="p-4">
        <SectionTitle icon={<Bell size={18} />} title={t('notif.title')}
          right={<Button variant="ghost" className="text-xs py-1.5" onClick={markAllAlertsRead}>{t('notif.markAll')}</Button>} />
        {activeAlerts.length === 0 ? (
          <EmptyState icon={<BellOff size={18} />} title={t('notif.empty')} body="You'll see hazard alerts and connectivity updates here as they come in." />
        ) : (
          <div className="space-y-2">
            {activeAlerts.map(a => (
              <div key={a.id} className="flex gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-slate-200 hover:bg-slate-50/60">
                <Pill tone={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'amber' : 'blue'}>{a.type}</Pill>
                <div className="flex-1">
                  <div className="font-bold text-[13px] text-slate-800">{a.title}</div>
                  <div className="text-[11px] text-slate-500">{a.message}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{a.location} · {timeAgo(a.time)} · push/SMS/app</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
