# SETU-NER — Smart Enroute Transit & Utility for the North East Region

**SIH26002 · AI-based Smart Logistics & Accessibility Intelligence Platform for NER**
Ministry of Development of North Eastern Region (MDoNER) · Smart India Hackathon 2026

"Setu" (सेतु) = bridge — connectivity across NER's hills and rivers.

---

## Run it

```bash
npm install
npm run dev        # dev server on :5173
npm run build && npm run preview   # production build on :4173
```

Open, then sign in — **Create account → MDoNER Official** (Google + a `.gov.in`/`.nic.in` email) for the full command view, or use the one-click demo accounts
(any role works; Citizen is for reporting, Official/Admin unlocks Dashboard,
Disaster Mode and the Gap Analyzer).

## 3-minute judge demo script

1. **Plan Route** — Guwahati → Haflong (Dima Hasao), cargo = Medicine.
   Both NH-54 and the Jowai corridor are blocked by verified landslides; the
   terrain engine routes the medicine convoy via the **open Diphu valley
   corridor** (green) with distance, ETA, risk score, delay reason and a
   **convoy window** for the single-lane ghat. See the *Disruption forecast*
   panel and the predictive-reroute banner.
2. **Track** — tap the stalled 🚛 medicine convoy: ETA, delay reason,
   **movement replay slider**, and the warehouse→depot→**village** last-mile
   confirmation that closes the delivery loop.
3. **Offline mode (star feature)** — click **Online** in the top bar to go
   offline → the hazard strip and banners switch to "Offline — cached data".
   Open **Report**, pin a location on the map, submit an incident → it shows
   an orange **"queued"** badge. Click the connectivity toggle back online →
   the report **auto-syncs** and fires a control-room alert.
4. **Dashboard** — KPI cards, bottleneck bars (terrain/rain/history/sensor
   breakdown), throughput + 48 h risk-trend charts (recharts), the
   **supply-priority queue** (medicine first), and the **auto-drafted
   emergency requisition** (review & send). Toggle **Monsoon/Dry season** to
   watch the risk model re-weight.
5. **Disaster Mode** — one click: emergency corridors (blue), evacuation /
   last-known accessible paths (amber), cut-off villages, relief camps,
   hospitals and warehouses.
6. **Supply–Demand Gap Analyzer** — districts colour-coded by days-of-stock;
   click **Draft requisition** on a critical district.
7. Switch the language to **অসমীয়া (Assamese)** or **ꯃꯩꯇꯩꯂꯣꯟ (Meiteilon)**;
   ask the floating **SETU Sahayak** chatbot "is the road to Haflong safe?".

## The two standout features

- **Terrain-based risk model** (`src/lib/risk.ts`) — every road segment gets a
  0–100 score from **slope/elevation (terrain), monsoon failure history,
  predictive rainfall exposure (current + 6 h Open-Meteo forecast peak) and
  low-cost IoT sensor readings** (vibration, water level, surface). Status is
  derived from the model plus verified field reports. Routing is a Dijkstra
  graph whose edge weight is risk- and cargo-aware (medicine/relief priority,
  construction held at caution).
- **Real offline mode** — IndexedDB (`idb`) caches weather/positions/alerts and
  queues field reports; a service worker caches the app shell **and map tiles**;
  reports sync on reconnect with an alert. Demonstrable live via the top-bar
  connectivity toggle (or DevTools offline).

## Tech

React + Vite + TypeScript · Tailwind (exact MDoNER green/blue/amber palette) ·
Zustand · react-router · react-leaflet + OpenStreetMap · recharts ·
react-hook-form · react-i18next (English + Assamese + Manipuri, Bhashini-ready) ·
idb/IndexedDB + service worker (PWA) · Open-Meteo live weather (no API key).

**Sample data:** 38 NER districts/towns, 40 road/bridge segments with terrain
attributes, 14 GPS-simulated vehicles (incl. community last-mile carriers),
22 facilities (warehouses/hospitals/relief camps/depots/fuel), seeded incidents
and district stock levels — all in `src/data/ner.ts`.
