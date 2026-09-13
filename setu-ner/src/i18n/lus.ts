// Mizo (Mizo ṭawng) — key phrases, spoken across Mizoram and parts of
// Cachar/Dima Hasao (Assam), a core SETU-NER demo region. The full UI
// falls back to English (see i18n/index.ts fallbackLng); production uses
// the Bhashini (MeitY) translation API for full coverage, same plan noted
// in mani.ts.
const lus: Record<string, unknown> = {
  appName: 'SETU-NER',
  tagline: 'Chhungril Awmna Ram Sipuiah lam leh thil kalpui thiam tak, tawnfel taka hriatna nei.',
  online: 'Online',
  offline: 'Offline — data dahsan lantirna',
  nav: {
    home: 'In', plan: 'Kawng ruahmanna siam', track: 'Zui',
    report: 'Report', dashboard: 'Dashboard', alerts: 'Vaukan thu', help: 'Ṭanpuina',
  },
  common: {
    open: 'A hong', caution: 'Fimkhur rawh', blocked: 'A khar',
    high: 'A sang', low: 'A tlem', verified: 'A dik tih chiang', pending: 'Enkawl a la ngai', yes: 'Aw', no: 'Aih',
  },
  home: {
    heroTitle: 'NER kalpui zel — tlang ten an dal ta pawh a nih chuan',
    planCta: 'Kawng ruahmanna siam', trackCta: 'Thil thawn zui', reportCta: 'Buaina report',
  },
  report: {
    title: 'Kawngah buaina report',
    queued: 'Offline-ah dahsan a ni — internet a awm hunah a kirtir kher ang',
  },
  auth: { login: 'Lut', logout: 'Chhuak', welcome: 'Kan lawm che!' },
}
export default lus
