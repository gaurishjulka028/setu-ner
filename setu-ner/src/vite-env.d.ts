/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the SETU-NER backend (server/). Defaults to http://localhost:4000. */
  readonly VITE_API_URL?: string
  /** Stadia Maps API key (free tier, stadiamaps.com) — powers the Leaflet tile layer in MapView.tsx. */
  readonly VITE_STADIA_API_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
