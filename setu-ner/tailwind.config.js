/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Forest-green / river-blue — the original NER-identity palette.
        // Was drifted to a generic indigo/teal SaaS look; reverted here to
        // signal an official, trustworthy regional government platform.
        // (The map already hardcoded these exact hexes for its primary
        // route line and facility markers — this just makes the rest of
        // the UI match what the map was already doing.)
        primary: '#0B6E4F',
        'primary-dark': '#095A40',
        'primary-light': '#E3F2EC',
        secondary: '#1B4965',
        'secondary-dark': '#123449',
        'secondary-light': '#E4ECF3',
        // accent/success/hazard/caution below were drifted from the values the
        // rest of the app (MapView, charts, RiskTrend, Dashboard) already
        // hardcodes everywhere — this realigns the Tailwind tokens to match
        // so bg-accent/text-hazard/etc. render the same brand colour the map
        // and charts use, instead of a different generic amber/red/green.
        accent: '#E08E29',
        'accent-light': '#FBEFE1',
        // Darker-than-accent text shade for readable copy on accent/caution
        // light backgrounds (accent's own #E08E29 fails contrast as text).
        // Was being retyped ad hoc as text-[#9a5b0e] / text-[#9a6a00] in
        // 7+ files — token-ized so every usage stays in sync.
        'accent-text': '#9a5b0e',
        success: '#2E9E5B',
        'success-light': '#E2F1E8',
        hazard: '#D64545',
        'hazard-dark': '#a93636',
        'hazard-light': '#F9E5E5',
        caution: '#E0A929',
        'caution-text': '#9a6a00',
        'caution-light': '#FBF3E1',
        canvas: '#F8FAFC',
        main: '#172033',
      },
      fontFamily: {
        // The app actually loads/sets Plus Jakarta Sans on `body` in index.css;
        // aligning the Tailwind token to match so `font-sans` (used sparingly
        // in a few places) doesn't silently fall back to a different face.
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        // Slightly deeper / more considered than plain Tailwind grey shadows,
        // with a faint cool tint (rather than neutral rgba(0,0,0,.1)) so
        // elevation reads as "official instrument panel" rather than generic
        // SaaS-card-kit.
        card: '0 1px 2px rgba(9,26,35,0.05), 0 8px 20px -4px rgba(9,26,35,0.08)',
        panel: '0 16px 40px -8px rgba(9,26,35,0.22)',
        // Brand-tinted elevation for primary surfaces (hero, active nav, CTA) —
        // used sparingly so it stays a signature, not a default.
        brand: '0 10px 28px -8px rgba(11,110,79,0.35)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      backgroundImage: {
        // Dark hero/panel gradient — forest-to-river, with a faint amber glow
        // in one corner instead of a flat solid or a generic dark-navy wash.
        // (The contour-line texture itself lives in index.css as a layered
        // ::before so its opacity never washes out foreground text.)
        'hero-gradient': 'radial-gradient(120% 140% at 100% 0%, rgba(224,142,41,0.16) 0%, rgba(224,142,41,0) 45%), linear-gradient(155deg, #0F2A22 0%, #172033 52%, #123449 100%)',
        'panel-gradient': 'linear-gradient(180deg, rgba(11,110,79,0.05) 0%, rgba(11,110,79,0) 60%)',
      },
      letterSpacing: {
        tightest: '-0.035em',
      },
    },
  },
  plugins: [],
}
