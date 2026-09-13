// Khasi (Ka Ktien Khasi) — key phrases, spoken across the Khasi and Jaintia
// Hills districts of Meghalaya (a core SETU-NER demo region). The full UI
// falls back to English (see i18n/index.ts fallbackLng); production uses
// the Bhashini (MeitY) translation API for full coverage, same plan noted
// in mani.ts.
const kha: Record<string, unknown> = {
  appName: 'SETU-NER',
  tagline: 'Ka jingtip jingmut para ka jinglong shibor bad jinglap ïalade ha ka Rukom Khyndai Bymiet.',
  online: 'Online',
  offline: 'Offline — pyndonkam ka data ba la thap',
  nav: {
    home: 'Iing', plan: 'Rung ïalade', track: 'Peit ïalade',
    report: 'Pynkhreh', dashboard: 'Dashboard', alerts: 'Jingpynbna', help: 'Rong',
  },
  common: {
    open: 'La ai bnai', caution: 'Kylli kylla', blocked: 'La thep',
    high: 'Kham heh', low: 'Kham nyngkong', verified: 'La pynshisha', pending: 'Ha ka jingiaid', yes: 'Ohoi', no: 'Cha',
  },
  home: {
    heroTitle: 'Bad ka jingïalade ha ka lynti — hatah pat lada ka lum ym leit ha ka jaka',
    planCta: 'Rung ïalade', trackCta: 'Peit ka baksa', reportCta: 'Pynkhreh ka jingdum',
  },
  report: {
    title: 'Pynkhreh ka jingdum ha ka lynti',
    queued: 'La thep ha offline — nka pynïaid da lada dei online',
  },
  auth: { login: 'Shong dwar', logout: 'Mih dwar', welcome: 'Khublei shibor!' },
}
export default kha
