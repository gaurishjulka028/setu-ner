import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, X, Send, Mic, Square } from 'lucide-react'
import { useStore } from '../store/useStore'
import { SEGMENTS } from '../data/ner'
import { riskOf } from '../lib/risk'

interface Msg { who: 'bot' | 'user'; text: string }

// ── Web Speech helpers (Feature 5) ─────────────────────────────────────────
// Recognition: browser-native where present (Chrome/Edge/Safari). Replies are
// read aloud with SpeechSynthesis in the active UI language (en/as/mani/
// kha/lus → closest supported voice; kha/lus have no dedicated browser
// voice locale, so they fall back to en-IN same as mani). Bhashini (Meity)
// is the production voice pipeline for low-resource NER languages; the
// header note + fallback text keep that promise visible alongside the
// device-speech demo.

type AnyRec = { lang: string; interimResults: boolean; onresult: (e: any) => void; onerror: () => void; onend: () => void; start: () => void; stop: () => void }

function recognitionApi(): AnyRec | null {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) return null
  try { return new SR() } catch { return null }
}

const speechLang = (l: string) => (l === 'as' ? 'as-IN' : 'en-IN')
const recogLang = (l: string) => (l === 'as' ? 'as-IN' : 'en-IN')

function speak(text: string, lang: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  // Strip emoji/symbols so synthesis reads the words, not the glyph soup.
  const clean = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/[•·|/\\_*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = speechLang(lang)
  const base = speechLang(lang).slice(0, 2)
  const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(base))
  if (voice) u.voice = voice
  u.rate = 1.02
  window.speechSynthesis.speak(u)
}

export default function Chatbot() {
  const { t, i18n } = useTranslation()
  const { weather, season, alerts } = useStore()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<AnyRec | null>(null)
  const micSupported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  useEffect(() => {
    setMsgs([{ who: 'bot', text: greeting(i18n.language) }])
  }, [i18n.language])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // Stop any playback/recording when the panel closes or unmounts.
  useEffect(() => {
    if (!open) {
      recRef.current?.stop()
      setListening(false)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [open])

  useEffect(() => () => {
    recRef.current?.stop()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const rec = recognitionApi()
    if (!rec) return
    rec.lang = recogLang(i18n.language)
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const text = e?.results?.[0]?.[0]?.transcript as string | undefined
      setListening(false)
      if (text?.trim()) send(text.trim())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }

  const answer = (q: string): string => {
    const s = q.toLowerCase()
    // find a town/road mentioned
    const seg = SEGMENTS.find(x =>
      s.includes(x.to.toLowerCase().split(' (')[0]) ||
      s.includes(x.from.toLowerCase().split(' (')[0]) ||
      x.name.toLowerCase().split(' ').some(w => w.length > 4 && s.includes(w)))

    if ((s.includes('safe') || s.includes('block') || s.includes('ख') || s.includes('নিৰাপদ') || s.includes('ꯑꯆꯨꯝ')) && seg) {
      const r = riskOf(seg, weather, season)
      const verdict = r.status === 'blocked'
        ? `🚫 ${seg.name} is currently BLOCKED. ${seg.reportReason ?? ''} Please use an alternate route — open Plan Route for the safest detour.`
        : r.status === 'caution'
          ? `⚠️ ${seg.name} is passable with CAUTION. Risk ${r.total}/100 (rain ${r.rainMm}mm/h, slope ${seg.slope}%, ${seg.failureHistory} past failures). Single-lane ghat — travel in the convoy window.`
          : `✅ ${seg.name} is OPEN. Risk ${r.total}/100. Drive carefully — hill terrain, rain possible.`
      return verdict
    }
    if (s.includes('alert') || s.includes('hazard') || s.includes('landslide') || s.includes('flood')) {
      const high = alerts.filter(a => !a.resolved && a.severity === 'high')
      return high.length
        ? `There ${high.length === 1 ? 'is' : 'are'} ${high.length} high-severity alert${high.length > 1 ? 's' : ''}: ${high.slice(0, 3).map(a => a.title).join('; ')}.`
        : 'No high-severity alerts right now. 2 medium advisories are active on hill corridors — check the Alerts page.'
    }
    if (s.includes('medicine') || s.includes('relief') || s.includes('stuck') || s.includes('supply')) {
      return 'Priority queue: medicine and relief convoys get the first open corridor. Two convoys bound for Haflong (Dima Hasao) are currently stalled by the Sonapur landslide — the system has flagged them for rerouting via the Dimapur corridor plus last-mile handoff.'
    }
    if (s.includes('offline')) {
      return 'Yes — you can report incidents without network. Reports queue on your phone (check the orange “queued” badge) and sync automatically the moment signal returns. Map and alerts are also cached.'
    }
    if (s.includes('hello') || s.includes('hi') || s.includes('namaskar') || s.includes('নমস্কাৰ')) {
      return greeting(i18n.language)
    }
    return 'I can tell you whether a route is safe (try “is the road to Haflong safe?”), list active alerts, explain offline reporting, or check priority for medicine/relief convoys. Voice chat in regional languages is powered by Bhashini in production.'
  }

  const send = (text?: string) => {
    const q = (text ?? input).trim()
    if (!q) return
    setMsgs(m => [...m, { who: 'user', text: q }])
    setInput('')
    // Read the reply aloud in the active UI language (device SpeechSynthesis;
    // Bhashini is the production voice pipeline — see header note).
    setTimeout(() => {
      const reply = answer(q)
      setMsgs(m => [...m, { who: 'bot', text: reply }])
      speak(reply, i18n.language)
    }, 450)
  }

  const quick = ['Is the road to Haflong safe?', 'Active alerts', 'Offline reporting']

  return (
    <>
      <button onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close SETU Sahayak' : 'Open SETU Sahayak'} aria-expanded={open}
        className="fixed bottom-20 right-4 z-[1300] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-secondary-dark text-white shadow-panel transition hover:brightness-110 active:scale-95 md:bottom-5">
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
      {open && (
        <div role="dialog" aria-label="SETU Sahayak" className="fixed bottom-36 right-4 z-[1300] flex h-[min(440px,calc(100vh-10rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-panel slide-in md:bottom-20">
          <div className="contour-field bg-gradient-to-br from-secondary to-secondary-dark text-white px-4 py-3">
            <div className="font-bold text-sm">SETU Sahayak 🤖</div>
            <div className="text-[10px] text-white/70">{t('help.voiceNote')}</div>
          </div>
          <div className="flex-1 overflow-auto thin-scroll p-3 space-y-2 bg-canvas">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.who === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${m.who === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="px-3 pt-2 flex gap-1.5 flex-wrap bg-white border-t border-slate-100">
            {quick.map(q => (
              <button key={q} onClick={() => send(q)} className="text-[10px] bg-secondary-light text-secondary px-2 py-1 rounded-full font-semibold transition hover:bg-secondary hover:text-white">{q}</button>
            ))}
            {micSupported && (
              <button onClick={toggleMic} title={listening ? 'Listening… tap to stop' : `Speak — ${i18n.language === 'as' ? 'অসমীয়াত কওক' : i18n.language === 'mani' ? 'ꯃꯤꯇꯩꯂꯣꯟꯗ ꯉꯥꯡꯕꯤꯌꯨ' : i18n.language === 'kha' ? 'Ong ha ka Ktien Khasi' : i18n.language === 'lus' ? 'Mizo ṭawngin sawi rawh' : 'Tap and speak your question'}`}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold transition ${listening ? 'bg-hazard text-white animate-pulse' : 'bg-secondary-light text-secondary hover:brightness-95'}`}>
                {listening ? <><Square size={9} /> Listening…</> : <><Mic size={10} /> Speak</>}
              </button>
            )}
          </div>
          <div className="p-2.5 flex gap-2 bg-white">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={t('help.placeholder')}
              aria-label="Message SETU Sahayak"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            <button onClick={() => send()} aria-label="Send message" className="flex items-center justify-center rounded-lg bg-primary px-3 text-white transition hover:bg-primary-dark active:scale-95"><Send size={15} /></button>
          </div>
          <div className="pb-1.5 px-3 text-[9px] leading-snug text-slate-400">
            🎙️ Mic & read-aloud use your device voice ({i18n.language === 'as' ? 'অসমীয়া' : i18n.language === 'mani' ? 'ꯃꯤꯇꯩꯂꯣꯟ' : i18n.language === 'kha' ? 'Khasi' : i18n.language === 'lus' ? 'Mizo ṭawng' : 'English'}). Production regional voice = Bhashini (MeitY), per the header note.
          </div>
        </div>
      )}
    </>
  )
}

function greeting(lang: string) {
  if (lang === 'as') return 'নমস্কাৰ! মই SETU সহায়িকা। আপোনাৰ পথ নিৰাপদ নে নাই সুধক — যেনে “হাফলংলৈ পথ নিৰাপদ নে?”'
  if (lang === 'mani') return 'ꯈুৰুমজৰী! ꯑꯩ ꯍꯥꯏꯕꯁꯤ SETU ꯃꯇꯦꯡ ꯄꯤꯕꯅꯤ ꯫ ꯂꯝꯕꯤ ꯑꯗꯨ ꯐꯠꯇ꯭ꯔꯦ ꯍꯥꯏꯕꯗꯨ ꯍꯪꯕꯤꯌꯨ ꯫'
  if (lang === 'kha') return 'Khublei! Nga long ka SETU jingiarap. Peit ïa ka lynti — kum "Ka lynti sha Haflong la bnai ke ym?"'
  if (lang === 'lus') return 'Kan lawm che! Keimah hi SETU thawktu ka ni. Kawng dan chungchang zawh rawh — entirna "Haflong lam kawng a ṭha em?"'
  return 'Namaste! I’m SETU Sahayak. Ask me whether a route is safe — e.g. “is the road to Haflong safe?”'
}
