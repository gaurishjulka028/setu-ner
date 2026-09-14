// Meiteilon / Manipuri (ꯃꯩꯇꯩꯂꯣꯟ) — SETU-NER operational UI.
// Technical terms such as GPS, OTP, ETA, AI and API remain in their familiar form.
const mani: Record<string, unknown> = {
  appName: 'SETU-NER',
  tagline: 'ꯑꯋꯥꯡ-ꯈꯥ ꯅꯣꯡꯄꯣꯛ ꯂꯩꯕꯥꯛꯀꯤ ꯁꯃꯥꯔꯠ ꯂꯣꯖꯤꯁꯇꯤꯛꯁ ꯁꯦꯕꯥ',
  online: 'ꯑꯣꯟꯂꯥꯏꯟ', offline: 'ꯑꯣꯐꯂꯥꯏꯟ — ꯀꯦꯁ ꯇꯧꯔꯕꯥ ꯗꯦꯇꯥ ꯎꯠꯂꯤ',
  lastSync: 'ꯑꯔꯤꯕꯥ ꯁꯤꯡꯀ꯭ꯔꯣꯅꯥꯏꯖ', syncPending: 'ꯀ꯭ꯌꯨꯗꯥ ꯂꯩ — ꯀꯅꯦꯛꯁꯟ ꯍꯟꯅꯥ ꯂꯥꯛꯄꯗꯥ ꯁꯤꯡꯀ꯭ꯔꯣꯅꯥꯏꯖ ꯇꯧꯒꯅꯤ', syncedNow: 'ꯀꯅꯦꯛꯁꯟ ꯍꯟꯅꯥ ꯂꯥꯛꯂꯦ — ꯔꯤꯄꯣꯔꯠ ꯁꯤꯡꯀ꯭ꯔꯣꯅꯥꯏꯖ ꯇꯧꯔꯦ',
  nav: { home: 'ꯌꯨꯝ', plan: 'ꯂꯝ ꯄꯜꯂꯝ', track: 'ꯇ꯭ꯔꯦꯛ', report: 'ꯔꯤꯄꯣꯔꯠ', dashboard: 'ꯗꯦꯁꯕꯣꯔ꯭ꯗ', alerts: 'ꯑꯦꯂꯔꯠ', help: 'ꯃꯇꯦꯡ', more: 'ꯑꯇꯣꯞꯄ', gaps: 'ꯒꯦꯞ', bookings: 'ꯕꯨꯛꯀꯤꯡ', driver: 'ꯑꯩꯒꯤ ꯗ꯭ꯔꯥꯏꯚ', company: 'ꯀꯝꯄꯥꯅꯤ', verify: 'ꯚꯦꯔꯤꯐꯥꯏ' },
  common: {
    search: 'ꯊꯤ', from: 'ꯗꯒꯤ', to: 'ꯗꯥ', cargo: 'ꯀꯥꯔꯒꯣ ꯇꯥꯏꯞ', distance: 'ꯐꯥꯔꯦꯜ', eta: 'ETA', risk: 'ꯔꯤꯁ꯭ꯀ', status: 'ꯁ꯭ꯇꯦꯇꯁ', viewMap: 'ꯃꯦꯞꯇꯥ ꯎꯠꯂꯨ', details: 'ꯗꯤꯇꯦꯂ', close: 'ꯂꯣꯏꯁꯤꯜꯂꯨ', submit: 'ꯄꯤꯕꯤꯌꯨ', save: 'ꯗ꯭ꯔꯥꯐꯠ ꯁꯦꯝꯒꯠꯂꯨ', cancel: 'ꯀꯦꯟꯁꯦꯜ', confirm: 'ꯀꯟꯐꯔꯝ', send: 'ꯊꯥꯒꯠꯄ', allDistricts: 'ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ ꯄꯨꯝꯅꯃꯛ', allTypes: 'ꯇꯥꯏꯞ ꯄꯨꯝꯅꯃꯛ', filter: 'ꯐꯤꯂꯇꯔ', open: 'ꯍꯥꯡꯗꯣꯛꯂꯨ', caution: 'ꯁꯥꯊꯤꯔꯦ', blocked: 'ꯊꯤꯡꯈ꯭ꯔꯦ', low: 'ꯑꯣꯏꯅꯥ ꯅꯤꯄꯥ', medium: 'ꯃꯦꯗꯤꯌꯝ', high: 'ꯑꯆꯥꯎꯕꯥ', critical: 'ꯀ꯭ꯔꯤꯇꯤꯀꯦꯜ', verified: 'ꯚꯦꯔꯤꯐꯥꯏ', pending: 'ꯄꯤꯡꯈ꯭ꯔꯦ', yes: 'ꯍꯣꯏ', no: 'ꯅꯠꯇꯦ'
  },
  home: {
    heroTitle: 'ꯅꯣꯡꯁꯤꯟ ꯂꯝ ꯊꯤꯡꯂꯕꯁꯨ — ꯅꯦꯠꯋꯥꯔꯛ ꯆꯠꯊꯒꯅꯤ', heroSub: 'ꯑꯋꯥꯡ-ꯈꯥ ꯅꯣꯡꯄꯣꯛꯇꯥ AI ꯅꯥ ꯁꯃꯥꯔꯠ ꯂꯣꯖꯤꯁꯇꯤꯛꯁ ꯑꯃꯁꯨꯡ ꯑꯦꯛꯁꯦꯁꯤꯕꯤꯂꯤꯇꯤ ꯏꯟꯇꯦꯂꯤꯖꯦꯟꯁ — ꯂꯥꯏꯚ ꯂꯝ ꯔꯤꯁ꯭ꯀ, ꯐ꯭ꯂꯤꯠ ꯇ꯭ꯔꯦꯀꯤꯡ, ꯍꯥꯖꯥꯔ ꯑꯦꯂꯔꯠ ꯑꯃꯁꯨꯡ ꯑꯣꯐꯂꯥꯏꯟ ꯔꯤꯄꯣꯔꯇꯤꯡ।',
    planCta: 'ꯂꯝ ꯄꯜꯂꯝ ꯇꯧ', trackCta: 'ꯁꯤꯄꯃꯦꯟꯇ ꯇ꯭ꯔꯦꯛ', reportCta: 'ꯑꯅꯦꯝꯕꯥ ꯔꯤꯄꯣꯔꯠ ꯇꯧ', liveStatus: 'ꯂꯥꯏꯚ ꯁꯦꯕꯥ ꯁ꯭ꯇꯦꯇꯁ', roadsOpen: 'ꯍꯥꯡꯗꯣꯛꯂꯕꯥ ꯂꯝ ꯈꯟꯗ', activeAlerts: 'ꯑꯦꯛꯇꯤꯚ ꯍꯥꯖꯥꯔ ꯑꯦꯂꯔꯠ', vehiclesLive: 'ꯗꯦꯇꯥ ꯄꯤꯔꯤꯕꯥ ꯚꯦꯍꯤꯀꯜ', districtsCovered: 'ꯀꯣꯚꯔ ꯇꯧꯔꯕꯥ ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ', riskTitle: 'ꯇꯦꯔꯦꯟ ꯔꯤꯁ꯭ꯀ ꯏꯟꯖꯤꯟ', riskBody: 'ꯁ꯭ꯂꯣꯞ, ꯏꯂꯤꯕꯦꯁꯟ, ꯃꯣꯟꯁꯨꯟ ꯍꯤꯁꯇ꯭ꯔꯤ, ꯂꯥꯏꯚ ꯔꯦꯟ ꯑꯃꯁꯨꯡ ꯂꯝ ꯁꯦꯟꯁꯔ ꯑꯃꯗꯥ ꯁꯤꯡꯒꯜ 0–100 ꯁ꯭ꯀꯣꯔꯗꯥ ꯂꯣꯏꯁꯤꯟꯅꯕꯥ।', offlineTitle: 'ꯅꯣꯡꯗꯥ ꯑꯣꯐꯂꯥꯏꯟꯗꯁꯨ ꯊꯧꯔꯛꯄꯥ', offlineBody: 'ꯐꯤꯜꯗ ꯔꯤꯄꯣꯔꯠ ꯐꯣꯅꯗꯥ ꯀ꯭ꯌꯨ ꯇꯧꯒꯅꯤ ꯑꯃꯁꯨꯡ ꯁꯤꯒꯅꯦꯜ ꯍꯟꯅꯥ ꯂꯥꯛꯄꯗꯥ ꯁꯤꯡꯀ꯭ꯔꯣꯅꯥꯏꯖ ꯇꯧꯒꯅꯤ।', rerouteTitle: 'ꯄ꯭ꯔꯤꯗꯤꯛꯇꯤꯕ ꯔꯤ-ꯔꯥꯎꯇꯤꯡ', rerouteBody: 'ꯂꯝ ꯂꯣꯏꯅꯕꯥ ꯃꯃꯥꯡꯗꯥ ꯂꯝꯗꯥ ꯂꯩꯕꯥ ꯍꯥꯖꯥꯔ ꯐꯝꯗꯒꯤ ꯁꯤꯄꯃꯦꯟꯇ ꯁꯦꯐ ꯂꯝꯗꯥ ꯂꯥꯛꯍꯟꯕꯥ', mapTitle: 'ꯅꯦꯠꯋꯥꯔꯛ ꯑꯃꯥ ꯎꯠꯄꯥ'
  },
  plan: {
    title: 'ꯂꯝ ꯄꯜꯂꯝ', sub: 'ꯂꯥꯏꯚ ꯇꯦꯔꯦꯟ ꯑꯃꯁꯨꯡ ꯅꯨꯡ ꯔꯤꯁ꯭ꯀꯒꯥ ꯐꯥꯎ ꯁꯦꯐ ꯑꯃꯁꯨꯡ ꯐꯥꯁꯠ ꯂꯝ', origin: 'ꯍꯧꯕꯒꯤ ꯐꯝ', destination: 'ꯂꯣꯏꯕꯒꯤ ꯐꯝ', plan: 'ꯂꯝ ꯄꯜꯂꯝ ꯇꯧ', primary: 'ꯄꯥꯔꯝꯕꯤꯕꯥ (ꯁꯦꯐꯦꯁ꯭ꯠ)', alternate: 'ꯑꯅꯧꯕꯥ (ꯐꯥꯁꯇꯦꯁ꯭ꯠ)', noRoute: 'ꯃꯄꯨꯡ ꯍꯥꯡꯗꯣꯛꯂꯕꯥ ꯂꯝ ꯑꯃꯠꯇ ꯂꯩꯇꯦ — ꯐꯝ ꯑꯁꯤ ꯀꯟꯅ ꯇꯤꯡꯈ꯭ꯔꯕꯥ ꯌꯥꯏ। ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗꯗꯥ ꯍꯥꯟꯅꯥ ꯈꯪꯕꯥ ꯂꯝ ꯎꯠꯂꯨ।', delayReason: 'ꯂꯝ ꯍꯥꯏꯕꯒꯤ ꯃꯔꯝ', convoyTitle: 'ꯀꯟꯚꯣꯏ ꯃꯇꯝ ꯄꯥꯔꯝꯕꯤꯕꯥ', convoyBody: 'ꯑꯃꯥꯁꯨ ꯂꯦꯟ ꯍꯥꯏ-ꯔꯤꯁ꯭ꯀ ꯐꯝ — ꯃꯁꯤꯒꯤ ꯁꯥꯏꯟꯒꯤ ꯃꯇꯝꯗꯥ ꯆꯠꯂꯨ।', forecast: 'ꯗꯤꯁꯔꯞꯁꯟ ꯐꯣꯔꯀꯥꯁꯠ', rerouteBanner: 'ꯄ꯭ꯔꯤꯗꯤꯛꯇꯤꯕ ꯔꯤ-ꯔꯥꯎꯇꯤꯡ: ꯂꯝꯒꯤ ꯍꯥꯖꯥꯔ ꯔꯤꯁ꯭ꯀ ꯍꯦꯟꯒꯠꯂꯤ।', priorityNote: 'ꯃꯦꯗꯤꯁꯤꯟ/ꯔꯤꯂꯤꯐ ꯀꯥꯔꯒꯣꯅꯥ ꯑꯆꯥꯎꯕꯥ ꯄ꯭ꯔꯥꯏꯑꯣꯔꯤꯇꯤ ꯐꯪꯒꯅꯤ ꯑꯃꯁꯨꯡ ꯁꯥꯊꯤꯔꯕꯥ ꯂꯝ ꯌꯥꯕꯥ ꯌꯥꯏ'
  },
  track: {
    title: 'ꯐ꯭ꯂꯤꯠ ꯑꯃꯁꯨꯡ ꯀꯥꯔꯒꯣ ꯇ꯭ꯔꯦꯀꯤꯡ', sub: 'NER ꯄꯨꯝꯅꯃꯛꯇꯥ ꯂꯥꯏꯚ GPS ꯐꯝ', replay: 'ꯃꯨꯚꯃꯦꯟꯇ ꯔꯤꯄ꯭ꯂꯦ', live: 'ꯂꯥꯏꯚ', vehicleId: 'ꯚꯦꯍꯤꯀꯜ ID', cargo: 'ꯀꯥꯔꯒꯣ', driver: 'ꯗ꯭ꯔꯥꯏꯚꯔ', operator: 'ꯑꯣꯄꯔꯦꯇꯔ', route: 'ꯂꯝ', currentLoc: 'ꯍꯧꯖꯤꯛꯀꯤ ꯐꯝ', dest: 'ꯂꯣꯏꯕꯒꯤ ꯐꯝ', delayedBy: 'ꯂꯝ ꯍꯥꯏꯔꯦ', onTime: 'ꯃꯇꯝꯗꯥ', halted: 'ꯊꯤꯡꯈ꯭ꯔꯦ', moving: 'ꯆꯠꯂꯤ', lastMile: 'ꯂꯥꯁꯠ-ꯃꯥꯏꯜ ꯍꯟꯊꯣꯛꯄ', lastMileBody: 'ꯒꯥꯎ ꯂꯦꯕꯦꯜꯗꯥ ꯔꯤꯁꯤꯠ ꯀꯟꯐꯔꯝ ꯇꯧꯅꯥ ꯗꯤꯂꯤꯚꯔꯤ ꯂꯣꯏꯁꯤꯟꯅꯕꯥ', received: 'ꯒꯥꯎꯗꯥ ꯀꯥꯔꯒꯣ ꯐꯪꯂꯦ'
  },
  report: {
    title: 'ꯐꯤꯜꯗ ꯑꯅꯦꯝꯕꯥ ꯔꯤꯄꯣꯔꯠ', sub: 'ꯒꯤꯌꯣ-ꯇꯦꯒꯇ ꯐꯣꯇꯣ ꯔꯤꯄꯣꯔꯠ — ꯑꯣꯐꯂꯥꯏꯟ ꯊꯧꯔꯛꯄꯥ, ꯀꯅꯦꯛꯁꯟ ꯍꯟꯅꯥ ꯂꯥꯛꯄꯗꯥ ꯁꯤꯡꯀ꯭ꯔꯣꯅꯥꯏꯖ', incident: 'ꯑꯅꯦꯝꯕꯒꯤ ꯇꯥꯏꯞ', severity: 'ꯁꯦꯚꯤꯔꯤꯇꯤ', description: 'ꯗꯤꯁ꯭ꯀ꯭ꯔꯤꯞꯁꯟ', photo: 'ꯐꯣꯇꯣ', useLocation: 'ꯑꯩꯒꯤ GPS ꯐꯝ ꯁꯤꯖꯤꯟꯅꯧ', pinOnMap: 'ꯅꯠꯇ꯭ꯔꯒꯥ ꯃꯦꯞꯇꯥ ꯇꯦꯞ ꯇꯧꯅꯥ ꯐꯝ ꯄꯤꯕꯤꯌꯨ', minor: 'ꯃꯥꯏꯅꯣꯔ', partial: 'ꯑꯔꯥꯏꯕꯥ ꯕ꯭ꯂꯣꯀꯦꯖ', impassable: 'ꯆꯠꯄꯥ ꯉꯝꯗꯕꯥ', queued: 'ꯔꯤꯄꯣꯔꯠ ꯑꯣꯐꯂꯥꯏꯟꯗꯥ ꯊꯝꯂꯦ ꯑꯃꯁꯨꯡ ꯀ꯭ꯌꯨꯗꯥ ꯂꯩ', synced: 'ꯔꯤꯄꯣꯔꯠ ꯀꯟꯇ꯭ꯔꯣꯜ ꯔꯨꯝꯗꯥ ꯄꯤꯔꯦ', pointsEarned: 'ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯔꯕꯗꯥ ꯄꯣꯏꯟꯠ ꯐꯪꯒꯅꯤ', photoAnalysis: 'AI ꯐꯣꯇꯣ ꯑꯅꯥꯂꯥꯏꯖꯤꯁ', trust: 'ꯔꯤꯄꯣꯔꯠ ꯇ꯭ꯔꯁꯠ', trustBody: 'ꯅꯦꯌꯔꯕꯥ ꯃꯤꯁꯤꯡ ꯑꯃꯁꯨꯡ ꯐꯤꯜꯗ ꯑꯣꯐꯤꯁꯔꯅꯥ ꯀꯟꯐꯔꯝ ꯇꯧꯕꯗꯥ ꯐꯤꯗꯦꯜꯇꯥ ꯍꯦꯟꯒꯠꯂꯒꯅꯤ।', myReports: 'ꯑꯩꯒꯤ ꯔꯤꯄꯣꯔꯠ', gamified: 'ꯚꯦꯔꯤꯐꯥꯏ ꯔꯤꯄꯣꯔꯠꯅꯥ ꯕꯦꯖ ꯑꯃꯁꯨꯡ ꯄꯣꯏꯟꯠ ꯄꯤꯒꯅꯤ', badgeFirst: 'ꯐꯔꯁꯠ ꯔꯤꯄꯣꯔꯠ', badgeVerified: 'ꯚꯦꯔꯤꯐꯥꯏꯗ ꯑꯥꯏ', badgeHero: 'ꯀꯝꯌꯨꯅꯤꯇꯤ ꯍꯤꯔꯣ'
  },
  alerts: { title: 'ꯍꯥꯖꯥꯔ ꯑꯃꯁꯨꯡ ꯁꯦꯕꯥ ꯑꯦꯂꯔꯠ', sub: 'ꯂꯝ ꯁ꯭ꯇꯦꯇꯁ, ꯁꯦꯟꯁꯔ, ꯅꯨꯡ ꯑꯃꯁꯨꯡ ETA ꯅꯤꯌꯥꯃꯒꯤ ꯃꯊꯛꯇꯥ ꯁ꯭ꯋꯣꯌꯅꯥ ꯁꯦꯝꯒꯠꯄꯥ', suggestedAction: 'ꯄꯥꯔꯝꯕꯤꯕꯥ ꯊꯧꯔꯥꯡ', forecastTitle: 'ꯗꯤꯁꯔꯞꯁꯟ ꯐꯣꯔꯀꯥꯁꯠ — ꯅꯦꯛꯁꯠ 24 ꯍꯧꯔꯁ'
  },
  dashboard: {
    title: 'ꯀꯝꯥꯟꯗ ꯗꯦꯁꯕꯣꯔ꯭ꯗ', sub: 'ꯔꯤꯖꯟ ꯄꯨꯝꯅꯃꯛꯀꯤ ꯂꯣꯖꯤꯁꯇꯤꯛꯁ ꯑꯃꯁꯨꯡ ꯀꯟꯦꯛꯇꯤꯚꯤꯇꯤ KPI', shipmentsToday: 'ꯉꯧꯃꯤꯠꯇꯥ ꯁꯤꯄꯃꯦꯟꯇ', onTime: 'ꯃꯇꯝꯗꯥ ꯗꯤꯂꯤꯚꯔꯤ', avgDelay: 'ꯑꯦꯚꯔꯦꯖ ꯂꯝ ꯍꯥꯏꯕꯥ', cutOff: 'ꯇꯤꯡꯈ꯭ꯔꯕꯥ ꯒꯥꯎ/ꯐꯝ', bottlenecks: 'ꯃꯈꯥꯗꯥ ꯂꯩꯕꯥ ꯕꯣꯇꯜꯅꯦꯛ', districtStatus: 'ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ ꯀꯟꯦꯛꯇꯤꯚꯤꯇꯤ', gapTitle: 'ꯁꯞꯂꯥꯏ–ꯗꯤꯃꯥꯟꯗ ꯒꯦꯞ', riskTrend: 'ꯔꯤꯁ꯭ꯀ ꯇ꯭ꯔꯦꯟꯗ (48 ꯍꯧꯔꯁ)', throughput: 'ꯂꯣꯖꯤꯁꯇꯤꯛꯁ ꯊꯧꯕꯤꯖꯤꯟ', weatherPanel: 'ꯂꯥꯏꯚ ꯅꯨꯡ ꯑꯥꯟꯀꯔ', roadmap: 'ꯔꯣꯗꯃꯦꯞ / ꯅꯨꯡꯁꯤꯅꯕꯥ', roadmapItems: ['ꯐꯤꯗꯕꯦꯛ ꯁꯤꯡꯒꯤ ꯃꯊꯛꯇꯥ ꯁꯦꯝꯒꯠꯂꯕꯥ ꯄ꯭ꯔꯗꯤꯛꯁꯟ', 'ꯀꯝꯌꯨꯅꯤꯇꯤ ꯂꯥꯁꯠ-ꯃꯥꯏꯜ ꯕꯨꯛꯀꯤꯡ ꯃꯥꯔꯀꯦꯠꯄ꯭ꯂꯦꯁ', 'ꯔꯤꯖꯤꯌꯟ ꯂꯣꯟꯗꯥ ꯚꯣꯏꯁ-ꯐꯔꯁꯠ ꯑꯁꯤꯁꯇꯦꯟꯇ (Bhashini)', 'ꯁꯦꯇꯦꯂꯥꯏꯠ ꯇꯦꯔꯦꯟ ꯆꯦꯟꯖ ꯗꯤꯇꯦꯛꯁꯟ'], disaster: 'ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗ', disasterOn: 'ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗ ꯑꯦꯛꯇꯤꯚ', disasterOff: 'ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗ ꯑꯦꯛꯇꯤꯚ ꯇꯧ', disasterBody: 'ꯏꯃꯔꯖꯦꯟꯁꯤ ꯀꯣꯔꯤꯗꯣꯔ, ꯏꯚꯥꯀꯨꯌꯦꯁꯟ ꯂꯝ, ꯔꯤꯂꯤꯐ ꯀꯦꯝꯞ, ꯍꯣꯁꯄꯤꯇꯥꯜ ꯑꯃꯁꯨꯡ ꯇꯤꯡꯈ꯭ꯔꯕꯥ ꯒꯥꯎꯗꯥ ꯍꯥꯟꯅꯥ ꯈꯪꯕꯥ ꯂꯝ ꯎꯠꯄꯤꯒꯅꯤ।', priorityTitle: 'ꯁꯞꯂꯥꯏ ꯄ꯭ꯔꯥꯏꯑꯣꯔꯤꯇꯤ ꯀ꯭ꯌꯨ', priorityBody: 'ꯂꯝ ꯀꯨꯝꯅꯥ ꯂꯩꯕꯗꯥ ꯃꯦꯗꯤꯁꯤꯟ ꯑꯃꯁꯨꯡ ꯔꯤꯂꯤꯐ ꯃꯃꯥꯡꯗꯥ ꯆꯠꯂꯒꯅꯤ।', requisition: 'ꯑꯦꯃꯔꯖꯦꯟꯁꯤ ꯔꯤꯛꯕꯤꯖꯤꯁꯟ ꯁ꯭ꯋꯣꯌꯅꯥ ꯗ꯭ꯔꯥꯐꯠ', requisitionBody: 'ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ ꯑꯣꯊꯣꯔꯤꯇꯤꯗꯥ ꯄꯤꯕꯥ ꯌꯥꯕꯥ ꯃꯦꯁꯦꯖ — ꯌꯦꯡꯕꯤꯌꯨ ꯑꯃꯁꯨꯡ ꯊꯥꯒꯠꯂꯨ'
  },
  disaster: { title: 'ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗ', active: 'ꯑꯦꯛꯇꯤꯚ — ꯏꯃꯔꯖꯦꯟꯁꯤ ꯑꯣꯄꯔꯦꯁꯟ ꯗ꯭ꯔꯤꯁ', corridors: 'ꯏꯃꯔꯖꯦꯟꯁꯤ ꯀꯣꯔꯤꯗꯣꯔ', evacuation: 'ꯏꯚꯥꯀꯨꯌꯦꯁꯟ ꯂꯝ', cutoff: 'ꯇꯤꯡꯈ꯭ꯔꯕꯥ ꯒꯥꯎ', facilities: 'ꯀꯦꯝꯞ · ꯍꯣꯁꯄꯤꯇꯥꯜ · ꯋꯦꯔꯍꯥꯎꯁ', lastKnown: 'ꯍꯥꯟꯅꯥ ꯈꯪꯕꯥ ꯐꯪꯕꯥ ꯂꯝ', deactivate: 'ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗꯗꯒꯤ ꯅꯦꯛꯁꯤꯟꯕꯥ'
  },
  gaps: { title: 'ꯁꯞꯂꯥꯏ–ꯗꯤꯃꯥꯟꯗ ꯒꯦꯞ ꯑꯅꯥꯂꯥꯏꯖꯔ', sub: 'ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ ꯑꯁꯤꯒꯤ ꯁ꯭ꯇꯣꯛ ꯂꯩꯔꯤꯕꯥ ꯅꯨꯃꯤꯠꯀꯤ ꯃꯊꯛꯇꯥ ꯃꯃꯥꯡ ꯄꯤꯕꯥ', criticalItems: 'ꯄ꯭ꯔꯤꯁꯤꯁ ꯑꯥꯏꯇꯦꯝ ꯄꯔ ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ', daysStock: 'ꯅꯨꯃꯤꯠꯀꯤ ꯁ꯭ꯇꯣꯛ', requisition: 'ꯔꯤꯛꯕꯤꯖꯤꯁꯟ ꯗ꯭ꯔꯥꯐꯠ'
  },
  booking: { title: 'ꯐ꯭ꯔꯦꯠ ꯑꯃꯁꯨꯡ ꯂꯥꯁꯠ-ꯃꯥꯏꯜ ꯕꯨꯛꯀꯤꯡ', sub: 'ꯔꯦꯖꯤꯁꯇꯔ ꯇꯧꯔꯕꯥ ꯀꯦꯔꯤꯌꯔ ꯑꯃꯁꯨꯡ ꯀꯝꯌꯨꯅꯤꯇꯤ ꯇ꯭ꯔꯥꯟꯁꯄꯣꯔꯠ', book: 'ꯀꯦꯄꯥꯁꯤꯇꯤ ꯕꯨꯛ ꯇꯧ', community: 'ꯀꯝꯌꯨꯅꯤꯇꯤ ꯀꯦꯔꯤꯌꯔ', stage: 'ꯗꯤꯂꯤꯚꯔꯤ ꯁ꯭ꯇꯦꯖ', whOut: 'ꯋꯦꯔꯍꯥꯎꯁꯗꯒꯤ ꯑꯣꯎꯠ', depot: 'ꯗꯤꯄꯣꯇꯥ ꯐꯪꯂꯦ', village: 'ꯒꯥꯎꯗꯥ ꯐꯪꯂꯦ'
  },
  notif: { title: 'ꯅꯣꯇꯤꯐꯤꯀꯦꯁꯟ', markAll: 'ꯄꯨꯝꯅꯃꯛ ꯔꯤꯗ ꯑꯣꯏꯅꯥ ꯃꯥꯔꯛ ꯇꯧ', empty: 'ꯍꯧꯖꯤꯛ ꯐꯥꯎ ꯅꯣꯇꯤꯐꯤꯀꯦꯁꯟ ꯂꯩꯇꯦ' },
  help: { title: 'ꯃꯇꯦꯡ ꯑꯃꯁꯨꯡ ꯑꯁꯤꯁꯇꯦꯟꯇ', sub: 'ꯅꯍꯥꯛꯀꯤ ꯂꯣꯟꯗꯥ “ꯑꯩꯒꯤ ꯂꯝ ꯁꯦꯐ ꯑꯣꯏꯕ꯭ꯔꯥ?” ꯍꯥꯡꯕꯤꯌꯨ', placeholder: 'ꯑꯀꯣꯏꯕ — Haflong ꯗꯥ ꯂꯝ ꯁꯦꯐ ꯑꯣꯏꯕ꯭ꯔꯥ?', send: 'ꯊꯥꯒꯠꯄ', faq: 'ꯀꯨꯝꯅꯥ ꯍꯥꯡꯕꯥ ꯋꯥꯍꯟꯁꯤꯡ', voiceNote: 'ꯔꯤꯖꯤꯌꯟ ꯂꯣꯟꯒꯤ ꯚꯣꯏꯁ ꯆꯥꯠꯄꯥ Bhashini-ꯅꯥ ꯄꯥꯡꯊꯣꯛꯄꯤꯕꯅꯤ।' },
  auth: {
    login: 'ꯁꯥꯏꯟ ꯏꯟ', signup: 'ꯑꯀꯥꯎꯟꯇ ꯁꯦꯝꯒꯠꯄ', citizen: 'ꯄꯥꯕꯂꯤꯛ', operator: 'ꯗ꯭ꯔꯥꯏꯚꯔ',
    logistics: 'ꯂꯣꯖꯤꯁꯇꯤꯛꯁ ꯀꯝꯄꯥꯅꯤ', official: 'MDoNER ꯑꯣꯐꯤꯁꯔ', admin: 'ꯑꯦꯗꯃꯤꯅꯤꯁꯇ꯭ꯔꯦꯇꯔ',
    demo: 'ꯗꯤꯃꯣ ꯑꯀꯥꯎꯟꯇ — ꯃꯄꯥꯟ ꯑꯃꯗꯥ ꯂꯣꯛ ꯏꯟ', continueGuest: 'ꯄꯥꯕꯂꯤꯛ ꯌꯦꯡꯕꯤꯔꯣ',
    welcome: 'ꯈꯨꯔꯨꯝꯖꯔꯤ', points: 'ꯔꯤꯄꯣꯔꯠ ꯄꯣꯏꯟꯠ', logout: 'ꯁꯥꯏꯟ ꯑꯥꯎꯠ',
    signinTab: 'ꯁꯥꯏꯟ ꯏꯟ', registerTab: 'ꯑꯀꯥꯎꯟꯇ ꯁꯦꯝꯒꯠꯄ', pickRole: 'ꯅꯍꯥꯛꯀꯤ ꯑꯀꯥꯎꯟꯇꯀꯤ ꯃꯔꯨꯑꯣꯏ ꯈꯜꯂꯨ',
    shortCitizen: 'ꯃꯤꯑꯣꯏꯕꯒꯤ ꯑꯀꯥꯎꯟꯇ — ꯔꯤꯄꯣꯔꯠ ꯑꯃꯁꯨꯡ ꯔꯤꯂꯤꯐ ꯇ꯭ꯔꯦꯛ',
    shortOperator: 'ꯗ꯭ꯔꯥꯏꯚꯔ / ꯐ꯭ꯂꯤꯠ — ꯀꯟꯁꯣꯜ, ꯍꯥꯖꯥꯔꯗ, SOS',
    shortLogistics: 'ꯀꯝꯄꯥꯅꯤ — ꯕꯨꯛꯀꯤꯡ ꯑꯃꯁꯨꯡ ꯁꯞꯂꯥꯏ ꯒꯦꯞ',
    shortOfficial: 'ꯁꯔꯀꯥꯔꯤ — ꯗꯦꯁꯕꯣꯔ꯭ꯗ ꯑꯃꯁꯨꯡ ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗ',
    reqCitizen: 'ꯃꯤꯑꯣꯏꯕꯒꯤ ꯏ-ꯃꯦꯜ ꯑꯃ ꯌꯥꯅꯤꯡꯕꯥ ꯌꯥꯏ। OTP-ꯅꯥ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯕꯥ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯁꯦꯝꯗꯣꯛꯄꯥ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ।',
    reqOperator: 'ꯏ-ꯃꯦꯜ ꯑꯃ ꯌꯥꯅꯤꯡꯕꯥ ꯌꯥꯏ। OTP-ꯅꯥ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯕꯥ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯁꯦꯝꯗꯣꯛꯄꯥ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ।',
    reqLogistics: 'ꯀꯝꯄꯥꯅꯤꯒꯤ ꯏ-ꯃꯦꯜ ꯁꯤ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ — Gmail, Yahoo, Outlook ꯑꯃꯁꯨꯡ ꯑꯇꯣꯞꯄꯥ ꯄꯥꯔꯁꯤꯅꯜ ꯃꯦꯜ ꯑꯃꯁꯨꯡ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ। ꯃꯣꯕꯥꯏꯜ OTP ꯁꯦꯝꯗꯣꯛꯄꯥ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ।',
    reqOfficial: 'ꯁꯔꯀꯥꯔꯤ ꯑꯀꯥꯎꯟꯇ: *.gov.in / *.nic.in ꯏ-ꯃꯦꯜ ꯈꯛꯇꯗꯒꯤ Google-ꯅꯥ ꯁꯥꯏꯟ ꯏꯟ ꯇꯧꯕꯤꯌꯨ। ꯃꯣꯕꯥꯏꯜ OTP ꯁꯦꯝꯗꯣꯛꯄꯥ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ।',
    emailLabel: 'ꯏ-ꯃꯦꯜ', companyEmailLabel: 'ꯀꯝꯄꯥꯅꯤ ꯏ-ꯃꯦꯜ', passwordLabel: 'ꯄꯥꯁꯋꯥꯔ꯭ꯗ',
    fullName: 'ꯃꯤꯡ ꯃꯄꯨꯡ', fullNamePh: 'Anima Rabha', orgLabel: 'ꯀꯝꯄꯥꯅꯤꯒꯤ ꯃꯤꯡ', orgPh: 'Purvanchal Freight Pvt Ltd',
    emailPh: 'you@example.com', companyEmailPh: 'ops@yourcompany.in', passwordRule: 'ꯃꯤꯅꯤꯃꯝ ꯸ ꯂꯥꯏꯔꯤꯕꯥ; ꯑꯃꯁꯨꯡ ꯂꯦꯇꯔ ꯑꯃꯁꯨꯡ ꯅꯝꯕꯔ ꯑꯃ ꯂꯩꯒꯗꯕꯥ ꯅꯠꯇꯦ।',
    errName: 'ꯅꯍꯥꯛꯀꯤ ꯃꯤꯡ ꯃꯄꯨꯡ ꯏꯁꯤꯟꯕꯤꯌꯨ।', errEmail: 'ꯌꯥꯗꯕꯥ ꯏ-ꯃꯦꯜ ꯑꯗꯨ ꯏꯁꯤꯟꯕꯤꯌꯨ।',
    errGovEmail: 'ꯃꯁꯤ ꯁꯔꯀꯥꯔꯤ ꯏ-ꯃꯦꯜ ꯑꯣꯏꯒꯗꯕꯥ ꯃꯥꯏꯅꯕꯦ — ꯑꯣꯐꯤꯁꯔ ꯑꯃꯥ ꯑꯣꯏꯅꯥ Google-ꯅꯥ ꯁꯥꯏꯟ ꯏꯟ ꯇꯧꯕꯤꯌꯨ।',
    errFreeMail: 'ꯂꯣꯖꯤꯁꯇꯤꯛꯁ ꯀꯝꯄꯥꯅꯤꯅꯥ ꯃꯁꯥꯒꯤ ꯀꯝꯄꯥꯅꯤ ꯏ-ꯃꯦꯜ ꯅꯥ ꯔꯦꯖꯤꯁꯇꯔ ꯇꯧꯒꯗꯕꯥ।',
    errPhoneFirst: 'ꯅꯣꯡꯉꯣꯏ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔꯗꯨ OTP-ꯅꯥ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯕꯤꯌꯨ — ꯑꯁꯤ ꯑꯀꯥꯎꯟꯇ ꯐꯥꯏꯅ ꯂꯩꯒꯗꯕꯥ।',
    errPhone: 'ꯃꯤꯅꯤꯃꯝ ꯱꯰ ꯗꯤꯖꯤꯠ ꯏꯟꯗꯤꯌꯥ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯑꯃ ꯏꯁꯤꯟꯕꯤꯌꯨ।', errCode: 'ꯗꯤꯖꯤꯠ ꯶ ꯀꯣꯗ ꯑꯗꯨ ꯏꯁꯤꯟꯕꯤꯌꯨ।',
    welcomeToast: 'ꯈꯨꯔꯨꯝꯖꯔꯤ, {{name}}! {{role}} ꯑꯀꯥꯎꯟꯇ ꯁꯦꯝꯒꯠꯂꯦ।',
    phoneLabel: 'ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ', phoneCompulsory: 'ꯁꯦꯝꯗꯣꯛꯄꯥ ꯌꯥꯗꯕꯥ · OTP-ꯚꯦꯔꯤꯐꯥꯏ', phoneVerified: 'ꯚꯦꯔꯤꯐꯥꯏ',
    phoneVerifiedNote: 'OTP ꯚꯦꯔꯤꯐꯥꯏ', sendCode: 'ꯀꯣꯗ ꯊꯥꯒꯠꯄ', codeLabel: 'ꯗꯤꯖꯤꯠ ꯶ ꯀꯣꯗ', verifyCode: 'ꯚꯦꯔꯤꯐꯥꯏ',
    codeSentTo: '{{phone}}ꯗꯥ ꯊꯥꯒꯠꯂꯦ', devCode: 'ꯗꯤꯃꯣ ꯀꯣꯗ:', resendIn: 'ꯁꯦꯀꯟ {{secs}} ꯅꯤꯡꯗꯥ ꯑꯃꯨꯛ ꯊꯥꯒꯠꯂꯣ',
    viaSms: 'SMS-ꯅꯥ ꯀꯣꯗ ꯐꯪꯒꯅꯤ।', viaWhatsapp: 'WhatsApp-ꯇꯥ ꯀꯣꯗ ꯐꯪꯒꯅꯤ。',
    viaSimulated: 'SMS ꯄ꯭ꯔꯣꯚꯥꯏꯗꯔ ꯑꯃꯁꯨ ꯂꯩꯇꯦ — ꯀꯣꯗ ꯁꯤ ꯃꯐꯝ ꯑꯁꯤꯗꯥ ꯎꯠꯂꯤ।',
    orGoogle: 'ꯅꯠꯇ꯭ꯔꯒꯥ Google-ꯅꯥ ꯆꯠꯂꯨ', orEmail: 'ꯅꯠꯇ꯭ꯔꯒꯥ ꯏ-ꯃꯦꯜ ꯅꯥ ꯁꯥꯏꯟ ꯏꯟ ꯇꯧ',
    continueGoogle: 'Google-ꯅꯥ ꯆꯠꯂꯨ', continueGoogleGov: 'Google-ꯅꯥ ꯆꯠꯂꯨ — .gov.in / .nic.in ꯑꯀꯥꯎꯟꯇ',
    googleSigninNote: 'ꯑꯀꯥꯎꯟꯇ ꯐꯥꯏꯅ ꯀꯥꯡꯂꯣꯏ। ꯅꯨꯡꯉꯥꯏꯅꯕꯥ Google ꯑꯀꯥꯎꯟꯇ ꯑꯃ ꯆꯥꯏꯂꯗꯥ Citizen ꯑꯣꯏꯅꯥ ꯁꯦꯝꯒꯠꯂꯒꯅꯤ — Driver, Company ꯅꯠꯇ꯭ꯔꯒꯥ Official ꯑꯣꯏꯔꯕꯗꯤ Create account-ꯇꯥ ꯈꯜꯂꯨ।',
    googleRegisterNote: 'Google ꯍꯥꯡꯒꯅꯤ — ꯈꯜꯂꯕꯥ ꯔꯣꯜ ꯑꯃꯁꯨꯡ ꯏ-ꯃꯦꯜ ꯅꯤꯌꯥꯃꯁꯤ ꯁ꯭ꯋꯣꯌꯅꯥ ꯆꯠꯂꯒꯅꯤ। ꯑꯀꯥꯎꯟꯇ ꯁꯦꯝꯒꯠꯄꯗꯥ ꯃꯁꯤꯗꯥ ꯂꯩꯔꯤꯕꯥ OTP ꯄꯤꯕꯥ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ।',
    googleDisabled: 'Google sign-in ꯁꯦꯝꯒꯠꯇꯕꯥ ꯅꯠꯇꯦ — setu-ner/.envꯗꯥ VITE_FIREBASE_* ꯍꯥꯄꯆꯤꯜꯂꯨ।',
    createAccount: 'ꯑꯀꯥꯎꯟꯇ ꯁꯦꯝꯒꯠꯄ', otpFirstNote: 'ꯆꯠꯄꯥ ꯌꯥꯕꯒꯤ ꯃꯇꯨꯡꯗꯥ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯕꯤꯌꯨ — OTP ꯁꯦꯝꯗꯣꯛꯄꯥ ꯌꯥꯗꯕꯥ ꯅꯠꯇꯦ।',
    phoneStepTitle: 'ꯑꯃꯨꯛ ꯑꯃꯥ ꯊꯥ: ꯐꯣꯟ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧ', phoneStepBody: 'SETU-NER ꯑꯀꯥꯎꯟꯇ ꯈꯨꯠꯁꯤꯟꯅꯥ OTP-ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯔꯕꯥ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯑꯃ ꯂꯩꯒꯗꯕꯥ — ꯑꯦꯂꯔꯠ ꯑꯃꯁꯨꯡ ꯗꯤꯁꯄꯥꯆ ꯃꯐꯝ ꯑꯗꯨꯗꯥ ꯐꯪꯒꯅꯤ।',
    verifyMobileTitle: 'ꯅꯍꯥꯛꯀꯤ ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧ', verifyMobileBody: 'ꯃꯇꯨꯡꯗꯥ ꯐꯣꯟ ꯑꯗꯨ OTP-ꯅꯥ ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯕꯤꯌꯨ। ꯚꯦꯔꯤꯐꯥꯏ ꯂꯣꯏꯔꯕꯥ ꯃꯇꯨꯡꯗꯥ ꯑꯀꯥꯎꯟꯇ ꯗꯤꯇꯦꯜ ꯄꯦꯖ ꯍꯥꯡꯒꯅꯤ।',
    detailsBody: 'ꯐꯣꯟ ꯚꯦꯔꯤꯐꯥꯏ ꯂꯣꯏꯔꯦ। ꯑꯗꯨꯒꯤ ꯃꯇꯨꯡꯗꯥ ꯑꯀꯥꯎꯟꯇ ꯗꯤꯇꯦꯜ ꯄꯤꯌꯨ ꯅꯠꯇ꯭ꯔꯒꯥ Google-ꯅꯥ ꯆꯠꯂꯨ।', changePhone: 'ꯐꯣꯟ ꯁꯥꯟꯗꯣꯛꯄꯥ',
    govGoogleBody: 'ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯔꯕꯥ ꯁꯔꯀꯥꯔꯤ Google ꯑꯀꯥꯎꯟꯇ ꯁꯤ ꯆꯠꯆꯔꯣ। ꯈꯜꯂꯕꯥ ꯔꯣꯜ ꯑꯃꯁꯨꯡ ꯗꯣꯃꯦꯟ ꯅꯤꯌꯥꯃꯁꯤ ꯁ꯭ꯋꯣꯌꯅꯥ ꯆꯠꯂꯒꯅꯤ।',
    googlePhoneReady: 'ꯃꯣꯕꯥꯏꯜ ꯅꯝꯕꯔ ꯁꯦꯝꯗꯣꯛꯂꯦ, ꯑꯗꯨꯅꯥ Google ꯔꯦꯖꯤꯁꯇꯔ ꯍꯧꯒꯠꯄꯥ ꯌꯥꯔꯦ।',
    backToSignin: 'ꯍꯟꯗꯣꯛꯂꯨ', noAccount: 'ꯅꯨꯡꯉꯥꯏꯅꯕꯥ ꯑꯣꯏꯔꯤ?', haveAccount: 'ꯑꯀꯥꯎꯟꯇ ꯑꯃ ꯂꯩꯔꯤꯕ꯭ꯔꯥ?',
    demoDescCitizen: 'ꯗꯤꯃꯣ · ꯄꯥꯁꯋꯥꯔ꯭ꯗ: demo', demoDescOperator: 'ꯗꯤꯃꯣ · ꯄꯥꯁꯋꯥꯔ꯭ꯗ: demo', demoDescLogistics: 'ꯗꯤꯃꯣ · ꯄꯥꯁꯋꯥꯔ꯭ꯗ: demo', demoDescOfficial: 'ꯗꯤꯃꯣ · ꯄꯥꯁꯋꯥꯔ꯭ꯗ: demo',
    rbacNote: 'ꯔꯣꯜ-ꯅꯥ ꯁꯥꯏꯟ ꯏꯟ: ꯑꯀꯥꯎꯟꯇ ꯐꯥꯏꯅ ꯃꯥꯡꯗꯕꯥ ꯄꯦꯖ ꯈꯛ ꯎꯠꯄꯤꯕꯅꯤ — ꯄꯥꯕꯂꯤꯛꯅꯥ ꯔꯤꯄꯣꯔꯠ ꯑꯃꯁꯨꯡ ꯁꯤꯄꯃꯦꯟꯇ ꯇ꯭ꯔꯦꯛ, ꯗ꯭ꯔꯥꯏꯚꯔꯅꯥ ꯀꯟꯁꯣꯜ, ꯀꯝꯄꯥꯅꯤꯅꯥ ꯕꯨꯛꯀꯤꯡ ꯑꯃꯁꯨꯡ ꯒꯦꯞ, ꯑꯣꯐꯤꯁꯔꯅꯥ ꯗꯦꯁꯕꯣꯔ꯭ꯗ ꯑꯃꯁꯨꯡ ꯗꯤꯖꯥꯁꯇꯔ ꯃꯣꯗ ꯐꯪꯒꯅꯤ।',
    signedOut: 'ꯁꯥꯏꯟ ꯑꯥꯎꯠ ꯇꯧꯔꯦ', showPassword: 'ꯄꯥꯁꯋꯥꯔ꯭ꯗ ꯎꯠꯄꯤꯌꯨ', hidePassword: 'ꯄꯥꯁꯋꯥꯔ꯭ꯗ ꯊꯝꯂꯣ', signingIn: 'ꯁꯥꯏꯟ ꯏꯟ ꯇꯧꯔꯤ…',
    googlePopupBlocked: 'Google popup ꯑꯗꯨ browser-ꯅꯥ block ꯇꯧꯔꯦ — popup allow ꯇꯧꯗꯨꯅꯥ ꯑꯃꯨꯛ ꯈꯟꯕꯤꯌꯨ।', googleUnauthorizedDomain: 'Google sign-in domain ꯑꯁꯤꯗꯥ ꯁꯤꯇꯥꯄ ꯂꯩꯇꯦ: "{{host}}"। Firebase Authorized domains-ꯇꯥ domain ꯑꯁꯤ ꯍꯥꯄꯆꯤꯜꯂꯨ।', googleNetworkError: 'Google-ꯒꯥ ꯅꯦꯠꯋꯥꯔ꯭ꯛ ꯇꯨꯡꯅꯥ ꯂꯩꯔꯦ — connection ꯑꯗꯨ ꯌꯦꯡꯕꯤꯌꯨ।', googleConfigError: 'Firebase Google sign-in ꯁꯦꯝꯒꯠꯄꯥ ꯅꯠꯇꯦ — VITE_FIREBASE_* settings ꯌꯦꯡꯕꯤꯌꯨ।', apiUnavailable: 'SETU-NER API server-ꯒꯥ ꯁꯝꯄꯔꯛ ꯇꯧꯕꯥ ꯉꯝꯗꯦ। Server ꯁꯤ ꯆꯠꯂꯤꯕꯥ ꯌꯦꯡꯕꯤꯌꯨ।', openNewTab: 'ꯄꯦꯖ ꯑꯁꯤ ꯅꯧꯅꯥ tab ꯑꯃꯗꯥ ꯍꯥꯡꯗꯣꯛꯂꯨ', govBrand: 'MDoNER, ꯐꯪꯕꯥ ꯏꯟꯗꯤꯌꯥ ꯁꯔꯀꯥꯔ', apiSecured: 'JWT-secured API',
  },

  driver: {
    title: 'ꯗ꯭ꯔꯥꯏꯚꯔ ꯀꯟꯁꯣꯜ', sub: 'ꯅꯍꯥꯛꯀꯤ ꯚꯦꯍꯤꯀꯜ, ꯃꯃꯥꯡꯒꯤ ꯍꯥꯖꯥꯔ ꯑꯃꯁꯨꯡ ꯑꯦꯛ-ꯇꯦꯞ SOS',
    myVehicle: 'ꯑꯩꯒꯤ ꯚꯦꯍꯤꯀꯜ', pickVehicle: 'ꯅꯍꯥꯛꯀꯤ ꯚꯦꯍꯤꯀꯜ ꯈꯜꯂꯨ', pickVehicleTitle: 'ꯍꯧꯅꯕꯥ ꯚꯦꯍꯤꯀꯜ ꯈꯜꯂꯨ',
    pickVehicleBody: 'ꯃꯃꯥꯡꯒꯤ ꯂꯤꯁꯠꯇꯗꯒꯤ ꯅꯍꯥꯛ ꯆꯥꯜꯂꯤꯕꯥ ꯚꯦꯍꯤꯀꯜ ꯈꯜꯂꯨ — ꯀꯟꯁꯣꯜꯅꯥ ꯂꯥꯏꯚ ꯂꯝ, ꯍꯥꯖꯥꯔ ꯑꯃꯁꯨꯡ ETA ꯇ꯭ꯔꯦꯛ ꯇꯧꯒꯅꯤ।',
    routeStatus: 'ꯂꯝꯒꯤ ꯁ꯭ꯇꯦꯇꯁ', actions: 'ꯊꯧꯔꯥꯡ', shareGps: 'ꯑꯩꯒꯤ GPS ꯁꯦꯝꯗꯣꯛꯂꯨ', liveMap: 'ꯂꯥꯏꯚ ꯐꯝ',
    hazardsAhead: 'ꯅꯍꯥꯛꯀꯤ ꯂꯝꯒꯤ ꯃꯃꯥꯡꯗꯥ ꯍꯥꯖꯥꯔ', hazardsOnPath: 'ꯅꯍꯥꯛꯀꯤ ꯃꯃꯥꯡꯗꯥ', onRoute: 'ꯄꯨꯔꯤ ꯂꯝꯗꯥ', noHazards: 'ꯍꯧꯖꯤꯛ ꯅꯍꯥꯛꯀꯤ ꯂꯝ ꯐꯔꯦ',
    pathClear: 'ꯂꯝ ꯍꯥꯡꯗꯣꯛꯂꯦ', pathClearBody: 'ꯂꯝ ꯑꯁꯤꯗꯥ ꯁꯥꯊꯤ ꯅꯠꯇ꯭ꯔꯒꯥ ꯊꯤꯡꯈ꯭ꯔꯕꯥ ꯈꯟꯗ ꯂꯩꯇꯦ — ꯆꯠꯂꯨ।',
    alertsForRoute: 'ꯂꯝ ꯑꯁꯤꯒꯤ ꯑꯦꯂꯔꯠ', noRouteAlerts: 'ꯑꯦꯂꯔꯠ ꯂꯩꯇꯦ', noRouteAlertsBody: 'ꯂꯝ ꯑꯁꯤꯗꯥ ꯑꯦꯛꯇꯤꯚ ꯑꯦꯂꯔꯠ ꯂꯩꯇꯦ।',
    planAlt: 'ꯑꯅꯧꯕꯥ ꯂꯝ ꯄꯜꯂꯝ ꯇꯧ', reportIssue: 'ꯑꯅꯦꯝꯕꯥ ꯔꯤꯄꯣꯔꯠ ꯇꯧ', shareNote: '“ꯑꯩꯒꯤ GPS ꯁꯦꯝꯗꯣꯛꯂꯨ” ꯅꯥ ꯐꯣꯅꯒꯤ ꯐꯝ ꯀꯟꯇ꯭ꯔꯣꯜ ꯔꯨꯝꯗꯥ ꯄꯤꯕꯥ ꯌꯥꯕꯅꯤ।', registeredPhone: 'ꯗꯤꯁꯄꯥꯆꯅꯥ ꯔꯦꯖꯤꯁꯇꯔ ꯅꯝꯕꯔꯗꯥ ꯑꯃꯁꯨ ꯄꯥꯡꯊꯣꯛꯄꯥ ꯌꯥꯒꯅꯤ',
  },
  company: {
    title: 'ꯀꯝꯄꯥꯅꯤ ꯀꯟꯁꯣꯜ', sub: 'ꯕꯨꯛꯀꯤꯡ, ꯗꯤꯃꯥꯟꯗ ꯁꯤꯒꯅꯦꯜ ꯑꯃꯁꯨꯡ ꯀꯨꯝꯅꯥ ꯊꯧꯔꯥꯡ', activeBookings: 'ꯑꯦꯛꯇꯤꯚ ꯕꯨꯛꯀꯤꯡ', inTransit: 'ꯂꯝꯗꯥ', delivered: 'ꯄꯤꯔꯦ', tonnage: 'ꯕꯨꯛ ꯇꯧꯔꯕꯥ ꯇꯟ', tonnageSub: 'ꯄꯨꯝꯅꯃꯛ ꯕꯨꯛꯀꯤꯡ',
    criticalDistricts: 'ꯀꯔꯤꯁꯤꯁ ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ', criticalSub: 'ꯁ꯭ꯇꯣꯛ ≤ ꯅꯨꯃꯤꯠ ꯵', recentBookings: 'ꯅꯨꯡꯉꯥꯏ ꯕꯨꯛꯀꯤꯡ', recentSub: 'ꯅꯍꯥꯛꯀꯤ ꯑꯀꯥꯎꯟꯇꯀꯤ ꯅꯨꯡꯉꯥꯏ', noBookings: 'ꯕꯨꯛꯀꯤꯡ ꯑꯃꯠꯇ ꯂꯩꯇꯦ', noBookingsBody: 'ꯕꯨꯛꯀꯤꯡ ꯄꯦꯖꯗꯥ ꯅꯍꯥꯛꯀꯤ ꯃꯁꯥꯒꯤ ꯐꯔꯁꯠ ꯐ꯭ꯔꯦꯠ ꯕꯨꯛꯀꯤꯡ ꯁꯦꯝꯒꯠꯂꯨ', allBookings: 'ꯕꯨꯛꯀꯤꯡ ꯗꯦꯁ꯭ꯀ ꯍꯥꯡꯗꯣꯛꯂꯨ', viewMap: 'ꯇ꯭ꯔꯦꯛ',
    demandSignal: 'ꯗꯤꯃꯥꯟꯗ ꯁꯤꯒꯅꯦꯜ', demandSub: 'ꯁ꯭ꯇꯣꯛ ꯅꯨꯡꯁꯤꯟꯅꯕꯥ ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ — ꯑꯇꯣꯞꯄꯥ ꯔꯤꯂꯤꯐ ꯐ꯭ꯔꯦꯠ ꯀꯗꯥꯏꯗꯥ ꯃꯇꯥꯡꯕꯥ',
    noGaps: 'ꯀꯔꯤꯁꯤꯁ ꯒꯦꯞ ꯂꯩꯇꯦ', noGapsBody: 'ꯗꯤꯁꯇ꯭ꯔꯤꯛꯇ ꯈꯨꯗꯤꯡꯅꯥ ꯅꯨꯃꯤꯠ ꯵ ꯈꯪꯗꯕꯥ ꯁ꯭ꯇꯣꯛ ꯂꯩ', chainNote: 'ꯀꯣꯜꯗ ꯆꯦꯟ', chainSub: 'ꯐꯥꯔꯃꯥ ꯑꯃꯁꯨꯡ ꯄ꯭ꯔꯤꯁꯦꯔꯚꯦꯕꯜ', chainBody: 'ꯄ꯭ꯔꯤꯁꯦꯔꯚꯦꯕꯜ ꯀꯥꯔꯒꯣ ꯅꯦꯌꯔꯦꯁꯠ ꯀꯣꯜꯗ ꯁꯇꯣꯔꯒꯥ ꯃꯥꯆꯤꯡ ꯇꯧꯕꯥ ꯑꯃꯁꯨꯡ ETA ꯒꯥ ꯂꯩꯅꯕꯥ ꯌꯦꯡꯕꯥ ꯇꯧꯕꯅꯤ।', openGaps: 'ꯒꯦꯞ ꯑꯅꯥꯂꯥꯏꯖꯔ ꯍꯥꯡꯗꯣꯛꯂꯨ',
  },
  verify: { title: 'ꯚꯦꯔꯤꯐꯤꯀꯦꯁꯟ ꯀ꯭ꯌꯨ', sub: 'ꯁꯤꯇꯤꯖꯟ ꯑꯅꯦꯝꯕꯥ ꯔꯤꯄꯣꯔꯠ ꯇ꯭ꯔꯥꯏꯖ — ꯚꯦꯔꯤꯐꯥꯏ ꯇꯧꯕꯅꯥ ꯂꯝꯒꯤ ꯁ꯭ꯇꯦꯇꯁ ꯑꯃꯁꯨꯡ ꯔꯤꯄꯣꯔꯇꯔꯒꯤ ꯄꯣꯏꯟꯠ ꯑꯄꯗꯦꯠ ꯇꯧ', pending: 'ꯄꯤꯡꯈ꯭ꯔꯦ', verified: 'ꯚꯦꯔꯤꯐꯥꯏ', rejected: 'ꯔꯤꯖꯦꯛꯇ', all: 'ꯄꯨꯝꯅꯃꯛ', empty: 'ꯀ꯭ꯌꯨ ꯐꯔꯦ', emptyBody: 'ꯃꯃꯥꯡ ꯑꯁꯤꯗꯥ ꯔꯤꯄꯣꯔꯠ ꯑꯃꯠꯇ ꯂꯩꯇꯦ', approve: 'ꯚꯦꯔꯤꯐꯥꯏ', reject: 'ꯔꯤꯖꯦꯛꯇ' },
  layers: { roads: 'ꯂꯝꯒꯤ ꯁ꯭ꯇꯦꯇꯁ', risk: 'ꯔꯤꯁ꯭ꯀ ꯍꯤꯠꯃꯦꯞ', accessibility: 'ꯐꯝ ꯐꯪꯕꯥ ꯁ꯭ꯀꯣꯔ', vehicles: 'ꯚꯦꯍꯤꯀꯜ', facilities: 'ꯐꯝꯁꯤꯡ', reports: 'ꯁꯤꯇꯤꯖꯟ ꯔꯤꯄꯣꯔꯠ', alerts: 'ꯍꯥꯖꯥꯔ ꯑꯦꯂꯔꯠ', gaps: 'ꯁꯞꯂꯥꯏ ꯁꯣꯠꯔꯇꯦꯖ' },
}
export default mani
