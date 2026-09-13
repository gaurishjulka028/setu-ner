# SETU-NER
### Smart Logistics & Accessibility Intelligence Platform for the North Eastern Region

A full-stack, role-based platform that tracks road/bridge accessibility, shipments, and disruptions across the North Eastern Region in real time — a live map, a risk-scored routing engine, field incident reporting with AI photo triage, and district-level dashboards, all synced live across every connected user.

🔗 **Live demo:** _add your Vercel URL here_
📽️ **Demo video:** _add your video link here_

---

## What it does

**A live, shared map of the region.** 38 districts across all 8 NER states, 40 road/river corridors, and a simulated fleet of 14+ vehicles (real GPS feeds take over automatically when connected — see [§ Vehicle tracking](#vehicle-tracking)) — one map component reused across every page, with switchable layers (roads, routes, risk zones, weather, facilities, alerts).

**A risk engine, not a red/yellow/green toggle.** Every road segment's status is computed server-side from terrain, rainfall, historical failure data, live sensor input, *and* current congestion (vehicle density per segment vs. road capacity) — plus one genuinely learned component: a small logistic-regression model (`server/src/ml/riskModel.ts`) trained on a synthetic failure dataset via `server/scripts/train-risk-model.ts`, blended in alongside the hand-weighted rule terms. This is disclosed in the code and in the UI, not oversold — the synthetic-training-data caveat is in the model file itself.

**Route planning that returns a reason, not just a line on a map.** `POST /api/routing/suggest` takes an origin, destination, cargo type, and season, and returns a primary + alternate route with distance, ETA, risk level, and *why* — congestion, monsoon rainfall, a segment marked blocked from a verified field report, etc.

**Field reports that actually change the map for everyone.** A citizen or field official uploads a geo-tagged photo (`Report a Field Incident`). It's run through a pluggable vision adapter (`server/src/lib/vision.ts` — Groq free tier by default, OpenRouter/Ollama/OpenAI/Gemini also supported) that reads severity and rejects irrelevant photos so a random upload can't fake a road closure. A `partial`/`impassable` read immediately marks that segment caution/blocked for **every connected user** via a live Socket.IO push (`broadcastSegmentStatus`) — not on next page load. Officials then triage it on a **Verification Queue**: approve to keep the status change and credit the reporter, or reject to lift it.

**Automated alerts, generated server-side.** Every few seconds the alert engine (`server/src/engine/alerts.ts`) evaluates blocked segments, high risk scores, heavy rain, and stalled/delayed vehicles against dedupe rules, persists them, and pushes them live — shown in-app with a notification bell.

**Disaster Mode.** A one-click toggle (admin/official) that switches the whole platform into an emergency operations view.

**A Supply–Demand Gap Analyzer.** Districts colour-coded by days-of-stock remaining per critical item, feeding a **Command Dashboard** with region-wide KPIs and a "review & send" flow that drafts and dispatches a requisition alert over WhatsApp.

**Freight & last-mile booking**, matched to community carriers for hill connectivity that trunk logistics can't reach — the tracking loop doesn't stop at a depot; a village-level confirmation step closes it.

**A real offline mode.** Field reports queue in IndexedDB when the network drops and sync automatically on reconnect — this is tested by disabling the network in dev tools, not just claimed.

**Multilingual UI**, English plus four NER regional languages (Assamese, Manipuri, Khasi, Mizo), via `react-i18next`.

**Role-based access**, enforced server-side, not just hidden in the UI: `citizen`, `operator`, `logistics`, `official`, `admin`, each seeing a different console (e.g. `DriverConsole` for operators, `CompanyConsole` for logistics, the command dashboard + verification queue for officials/admins).

## Honesty layer

Every map carries a **Live / GPS / Weather / Roads** legend that reports, straight from the server (`GET /api/data-sources`), what's real right now versus simulated — so nobody has to take a claim on faith. Vehicle markers are explicitly badged **GPS** (a real device fix in the last 30s) or **SIM** (server simulation). The same "degrade, don't fail closed" philosophy shows up throughout the backend: no vision-AI key → a disclosed pixel heuristic runs instead of silently pretending; no reachable government alert feed → the last good data (or a bundled offline copy) is served instead of an error; Stadia routing unreachable → falls back to public OSRM, then to schematic curves.

## Tech stack

**Frontend** — React 18 + TypeScript + Vite, Tailwind CSS, Zustand, react-router-dom, react-leaflet/Leaflet, recharts, react-hook-form, react-i18next, Firebase (Google Sign-In), Socket.IO client, `idb` for offline queuing, Vite PWA / service worker.

**Backend** — Node.js + Express (TypeScript), Prisma 7 over SQLite (via `@libsql/client` — the driver ships from npm, no engine-binary download at runtime), Socket.IO for live pushes, JWT auth (`jose`/`jsonwebtoken`), `zod` request validation, `multer` for photo uploads, `bcryptjs`.

**External integrations** — Stadia Maps for basemap tiles + road-geometry snapping (public OSRM as fallback), Open-Meteo for weather, the NDMA SACHET CAP feed for official government disaster alerts, a pluggable vision-model provider for incident photos, WhatsApp dispatch via MSG91 or Meta's Cloud API (simulated by default — logged to a server outbox — so the demo needs no credentials).

## Architecture

```
server/                    Express + Prisma API
├── prisma/schema.prisma    13 models: User, District, Segment, Vehicle,
│                           Shipment, Facility, IncidentReport, AlertItem,
│                           WeatherPoint, StockLevels, Booking, SystemState, OtpCode
├── src/
│   ├── engine/              risk.ts (scoring), alerts.ts, vehicles.ts (fleet
│   │                        sim + real GPS ingestion), segments.ts, geometry.ts,
│   │                        weather.ts, analysis.ts (disaster situation report)
│   ├── ml/riskModel.ts      the learned component of the risk score
│   ├── integrations/        govtAlerts.ts (NDMA SACHET), govtFeed.ts
│   ├── lib/                 vision.ts, whatsapp.ts, otp.ts, auth-rules.ts, …
│   └── routes/               auth, routing, vehicles, vehicle-positions,
│                              reports, shipments, bookings, alerts, stock,
│                              analysis, weather, govt-feed, whatsapp, system
└── realtime.ts              Socket.IO broadcast layer

setu-ner/                  React + Vite PWA
└── src/
    ├── pages/               Home, Login, PlanRoute, Track, DriverConsole,
    │                        CompanyConsole, Dashboard, Alerts, Report,
    │                        VerifyQueue, Bookings, Gaps, Disaster, Notifications, Help
    ├── components/          shared UI kit + MapView (one map, reused everywhere)
    ├── store/useStore.ts    Zustand store — auth, live data, offline cache
    ├── lib/                 risk.ts (client mirror of the server model),
    │                        api.ts, socket.ts, weather.ts, db.ts (IndexedDB), firebase.ts
    ├── i18n/                en, as, mani, kha, lus
    └── data/ner.ts          seeded districts / road network / facilities / fleet
```

## Run it locally

Needs **Node.js 18+** (20/22 recommended) and **npm**. No external database or paid accounts required to run the demo.

**Terminal 1 — API**
```bash
cd server
cp .env.example .env        # Windows: copy .env.example .env
npm install
npm run setup                # creates prisma/dev.db, runs migrations, seeds demo data
npm run dev                  # → http://localhost:4000
```

**Terminal 2 — Web app**
```bash
cd setu-ner
cp .env.example .env
npm install
npm run dev                  # → http://localhost:5173
```

Open **http://localhost:5173**. Health check: `curl http://localhost:4000/api/health` → `{"ok":true}`.

### Demo accounts
Real sign-in is Google + OTP-verified phone (no password registration). For a quick look, expand **Demo accounts** on the login screen (password `demo`):

| Role | Email | Console |
|---|---|---|
| Citizen | `citizen@setu-ner.demo` | Report incidents, track shipments, bookings |
| Operator | `operator@setu-ner.demo` | Driver Console ("My Drive") — vehicle, hazards ahead, GPS sharing |
| Logistics | `logistics@setu-ner.demo` | Company Console — bookings, demand signals, Gap Analyzer |
| Official | `official@setu-ner.demo` | Command Dashboard, Verification Queue, Disaster Mode |
| Admin | `admin@setu-ner.demo` | Everything |

## Vehicle tracking

A vehicle's marker is drawn from **real GPS** whenever a fix arrived in the last 30 seconds, from the server simulation otherwise. Three ways to feed a real fix, all documented in `server/SETUP.md`: (a) a driver's own phone via browser geolocation (no install), (b) a free tracker app (Traccar Client / OsmAnd / GPSLogger), or (c) a SIM-based hardware tracker speaking the OsmAnd/HTTP protocol.

## Project docs

- `server/SETUP.md` — clean-clone setup, Prisma troubleshooting, `.env` reference
- `PRODUCTION.md` — production build & deployment notes

## License

See [LICENSE](./LICENSE).
