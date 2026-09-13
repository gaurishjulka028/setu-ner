import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpCircle, Send, Mic, BookOpen, WifiOff, Mountain, Truck, Globe } from 'lucide-react'
import { Card, SectionTitle, Button } from '../components/ui'

const FAQ_KEYS = [
  'Is the road to Haflong safe?',
  'How does offline reporting work?',
  'Which alerts are active now?',
  'When should convoys travel?',
]

export default function Help() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [chat, setChat] = useState<{ who: 'bot' | 'user'; text: string }[]>([
    { who: 'bot', text: '👋 Ask me about route safety, alerts, or offline reporting. Use the language switcher in the top bar for অসমীয়া / ꯃꯩꯇꯩꯂꯣꯟ.' },
  ])

  const send = (qRaw?: string) => {
    const q = (qRaw ?? input).trim()
    if (!q) return
    const s = q.toLowerCase()
    let a = 'I help with: route safety (“is the road to Haflong safe?”), active alerts, offline reporting, and convoy timing. The floating assistant (bottom-right) is available on every screen.'
    if (s.includes('haflong') || s.includes('safe'))
      a = 'Haflong (Dima Hasao) is currently cut off: both the Jowai–Haflong and Haflong–Silchar corridors have verified landslide blockages. Do NOT dispatch via NH-54. The system recommends the Guwahati–Dimapur–Diphu corridor plus last-mile handoff; relief staging is at Diphu depot.'
    else if (s.includes('offline'))
      a = 'In low-signal areas: open the Report screen, attach a photo and pin your location (GPS works offline). The report queues on your phone with an orange “queued” badge and auto-syncs the moment signal returns. Maps and alerts are cached from your last session.'
    else if (s.includes('alert'))
      a = 'High-severity alerts: Sonapur landslide (Jowai–Haflong), Umrangso subsidence (Haflong–Silchar). Medium: Subansiri flood causeway (Lakhimpur–Dhemaji) and Churachandpur single-lane debris. See the Alerts page for actions.'
    else if (s.includes('convoy'))
      a = 'On single-lane high-risk stretches, the planner suggests a shared 40-minute departure window so vehicles travel together with radio contact, rather than alone through slide-prone ghats.'
    setChat(c => [...c, { who: 'user', text: q }, { who: 'bot', text: a }])
    setInput('')
  }

  const guides = [
    { icon: <Mountain size={16} />, title: t('home.riskTitle'), body: t('home.riskBody') },
    { icon: <WifiOff size={16} />, title: t('home.offlineTitle'), body: 'Toggle the connectivity switch in the top bar to try it live, then submit a report — it queues and syncs on reconnect.' },
    { icon: <Truck size={16} />, title: t('track.title'), body: 'Tap any vehicle for ETA, delay reason, movement replay and village-level receipt confirmation.' },
    { icon: <Globe size={16} />, title: t('help.voiceNote'), body: 'Bhashini integration provides voice translation across Assamese, Meiteilon, Bodo, Khasi, Garo, Mizo and Nagamese in production.' },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto grid lg:grid-cols-2 gap-4">
      <Card className="p-4 flex flex-col">
        <SectionTitle icon={<HelpCircle size={18} />} title={t('help.title')} sub={t('help.sub')}
          right={<span className="text-[10px] bg-secondary-light text-secondary px-2 py-1 rounded-full font-bold flex items-center gap-1"><Mic size={11} /> voice: Bhashini (prod)</span>} />
        <div className="flex-1 overflow-auto thin-scroll space-y-2 mb-3 max-h-80">
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.who === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${m.who === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-canvas border border-slate-200 text-slate-700 rounded-bl-sm'}`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {FAQ_KEYS.map(k => <button key={k} onClick={() => send(k)} className="text-[11px] bg-secondary-light text-secondary px-2.5 py-1 rounded-full font-semibold transition hover:bg-secondary hover:text-white">{k}</button>)}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={t('help.placeholder')} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          <Button variant="primary" aria-label="Send message" onClick={() => send()}><Send size={15} /></Button>
        </div>
      </Card>

      <div className="space-y-3">
        <Card className="p-4">
          <SectionTitle icon={<BookOpen size={17} />} title="How SETU-NER works" />
          <div className="space-y-3">
            {guides.map((g, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">{g.icon}</div>
                <div>
                  <div className="font-bold text-[13px] text-slate-800">{g.title}</div>
                  <div className="text-[12px] text-slate-500">{g.body}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="contour-field p-4 bg-gradient-to-br from-primary to-secondary text-white">
          <div className="text-sm font-bold">Demo walkthrough (3 min)</div>
          <ol className="text-[12px] text-white/85 mt-2 space-y-1 list-decimal pl-4">
            <li>Plan a route Guwahati → Haflong — see the safest detour avoid the landslide.</li>
            <li>Open Track — tap the stalled medicine convoy; replay movement.</li>
            <li>Toggle connectivity OFF (top bar), submit a report — watch it queue.</li>
            <li>Toggle back ON — the report auto-syncs and an alert fires.</li>
            <li>Open Dashboard → activate Disaster Mode → Gap Analyzer requisition.</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}
