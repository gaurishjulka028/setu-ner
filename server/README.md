# SETU-NER backend — Parts 1 & 2

Node.js + Express + TypeScript + Prisma + SQLite. Lives in `server/`
alongside the existing `setu-ner/` frontend, which this part does not touch.

## Setup

```bash
cd server
cp .env.example .env        # defaults are fine for local dev
npm install                 # no engine downloads needed (Prisma 7 + libsql adapter)
npm run setup               # creates dev.db, applies migrations, seeds demo data
npm run dev                 # starts the API on http://localhost:4000
```

## Endpoints added in the integration pass

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/shipments` | JWT | Plan Route → *Start Tracking*: creates a vehicle in the shared simulated fleet + its booking (persisted, broadcast) |
| `PATCH` | `/api/shipments/:id/route` | JWT | Plan Route → *Apply New Route* on an existing shipment |
| `GET` | `/api/segments/status` | public | Report-driven road statuses (`blocked`/`caution` + reason); also pushed live as the `segments:status` socket event |

Behavioural fixes in the same pass: segment statuses are loaded from the DB
at boot (blocks survive restarts), rejecting a report lifts the block it
applied, `SHIP-*` vehicles are snapshotted/resumed like the seed fleet,
last-mile bookings get a community carrier matched, seed reports/bookings
are inserted by `npm run seed`, and `POST /api/whatsapp/send` accepts
`to: "dispatcher"`.

## Demo accounts

Same five demo users as `DEMO_USERS` in `setu-ner/src/data/demoUsers.ts`,
now with a login email and a real bcrypt-hashed password (`demo` for all,
matching the frontend's placeholder password):

| role      | email                     | password |
|-----------|---------------------------|----------|
| citizen   | citizen@setu-ner.demo     | demo     |
| operator  | operator@setu-ner.demo    | demo     |
| logistics | logistics@setu-ner.demo   | demo     |
| official  | official@setu-ner.demo    | demo     |
| admin     | admin@setu-ner.demo       | demo     |

## Acceptance check

```bash
# 1. Login returns a JWT
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"official@setu-ner.demo","password":"demo"}'
# -> { "token": "...", "user": { "id": "u-off", "role": "official", ... } }

# 2. Protected route rejects requests without a token
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/auth/me
# -> 401

# 3. ...and accepts them with one
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"official@setu-ner.demo","password":"demo"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s http://localhost:4000/api/auth/me -H "Authorization: Bearer $TOKEN"
# -> { "user": { ... } }

# 4. Registration rules
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"X","email":"co@gmail.com","password":"passw0rd","role":"logistics","phone":"...","phoneToken":"..."}'
# -> 400: companies must use a company email
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"X","email":"a@b.com","password":"passw0rd","role":"official","phone":"...","phoneToken":"..."}'
# -> 403: officials sign in with Google using a gov.in / nic.in address

# 5. Role guard: a 'citizen' token is rejected on an official/admin-only route
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/dashboard/ping \
  -H "Authorization: Bearer $CITIZEN_TOKEN"
# -> 403
```

## Endpoints — Part 1

- `POST /api/auth/register` — self-service email + password registration
  for `citizen` / `operator` (driver) / `logistics` (company). Requires an
  OTP-verified phone (`phoneToken` from `/api/auth/otp/*`). Companies must
  use a company email (free-mail domains rejected); officials cannot
  register with a password (Google + `.gov.in`/`.nic.in` only); gov emails
  are refused here so they can't become password accounts.
- `POST /api/auth/login` — email + password -> `{ token, user }`
- `POST /api/auth/google` — Firebase/Google sign-in (verify the id_token's
  signature/issuer/audience via Google's public JWKS, `FIREBASE_PROJECT_ID`).
  `expectOfficial: true` rejects non-gov accounts outright. New accounts:
  gov email -> official, anything else -> citizen.
- `POST /api/auth/otp/send` / `POST /api/auth/otp/verify` — compulsory
  phone verification for every account (SMS/WhatsApp/simulated per
  `OTP_CHANNEL`; dev mode returns `devCode`).
- `GET /api/auth/me` — requires `Authorization: Bearer <token>`; the
  protected route used by the acceptance check
- `GET /api/districts`, `GET /api/segments`, `GET /api/facilities` —
  serve the seeded reference data (public, matches current unauthenticated
  frontend pages)
- `GET /api/{report,dashboard,gaps,disaster}/ping` — placeholder routes
  that exercise the same role restrictions as `<Guarded roles={[...]}>`
  in `App.tsx`, now enforced server-side.

## Endpoints — Part 2

Everything the frontend currently fakes in the browser, moved server-side.
The scoring/routing math itself is untouched — see `src/engine/risk.ts`,
which is a straight port of `setu-ner/src/lib/risk.ts`.

- `GET /api/weather?lat=&lng=` — Open-Meteo proxy (was
  `setu-ner/src/lib/weather.ts`), cached in-memory per-coordinate for 5
  minutes
- `POST /api/route-suggestion` — `{ origin, destination, cargo, season?,
  excludeSegmentIds? }` -> `{ primary, alternate }` (same shape
  `planRoutes()` returned client-side)
- `GET /api/segments/risk?season=monsoon|dry` — current `riskOf()` score
  per segment, for the map overlay
- `GET /api/vehicles` — snapshot of the server-simulated fleet
- **`/ws/vehicles`** (Socket.IO, not a plain WebSocket) — emits
  `vehicles:update` with the full fleet array every 4s to all connected
  clients. Connect with `io(url, { path: '/ws/vehicles' })`, not the raw
  `WebSocket` API.
- `GET /api/reports` (auth), `POST /api/reports` (auth) — same
  confidence/segment-status/alert side effects as `addReport()` in
  `useStore.ts`
- `PATCH /api/reports/:id/verify` (official/admin only) — `{ approve }`,
  mirrors `verifyReport()` including citizen point awards
- `GET /api/alerts` (public), `POST /api/alerts` — mirrors `pushAlert()`;
  also added `PATCH /api/alerts/:id/read` and `.../resolve` for the
  existing `markAllAlertsRead`/`resolveAlert` actions
- `GET /api/bookings` (auth), `POST /api/bookings` (auth) — mirrors
  `addBooking()`
- `PATCH /api/bookings/:id/last-mile` (auth) — mirrors `confirmLastMile()`,
  including marking the linked vehicle delivered in the live simulation
- `GET /api/stock` (official/admin/logistics) — serves `STOCKS`, now
  seeded into the `stock_levels` table

Alert generation (blocked segment -> alert, high risk -> alert, heavy
rain -> alert, stalled/delayed vehicle -> alert) runs automatically every
4s alongside the vehicle tick, deduped by title within a 6h window —
same rules as `generateAlerts()`, see `src/engine/alerts.ts`.

## A note on Prisma engines

The server uses Prisma 7 with the `@prisma/adapter-libsql` driver adapter,
so it does **not** need the Rust query engine that older Prisma versions
downloaded from `binaries.prisma.sh` (frequently blocked, and the root cause
of the earlier login/booking/route failures). The generated client lives in
`src/generated/prisma` and is committed; migrations are applied with
`npm run migrate` (`scripts/migrate.ts`). See `SETUP.md` for details.

### Part 2 acceptance check

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"official@setu-ner.demo","password":"demo"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s "http://localhost:4000/api/weather?lat=26.14&lng=91.73"
curl -s -X POST http://localhost:4000/api/route-suggestion \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Guwahati","destination":"Haflong (Dima Hasao)","cargo":"medicine"}'
curl -s http://localhost:4000/api/segments/risk
curl -s http://localhost:4000/api/vehicles
curl -s http://localhost:4000/api/reports -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:4000/api/alerts
curl -s http://localhost:4000/api/bookings -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:4000/api/stock -H "Authorization: Bearer $TOKEN"

# Watch the socket push updates every 4s (needs `npm install -g wscat` or similar,
# or write a 3-line socket.io-client script — plain `wscat` won't speak the
# Socket.IO protocol, only a real Socket.IO client will).
```

## Endpoints — Part B (real photo handling)

- `POST /api/reports/photo` (auth) — multipart upload, field name `photo`
  (JPEG or PNG, ≤ 12 MB). Stores the real image on local disk under
  `<server>/uploads/photos/` (gitignored; `UPLOAD_DIR` env overrides the
  root) and runs an actual pixel-level analysis of the uploaded bytes
  (`src/lib/photo.ts` — jpeg-js/pngjs decode + brightness/contrast/edge/
  colour heuristics; no filename string-matching). Returns
  `{ photoName, photoUrl, severity, confidence, width, height, features }`
  where `photoUrl` points at the statically served file.
- `GET /uploads/photos/<file>` — the stored image, served by Express
  static middleware (`src/index.ts`). Attach the returned `photoUrl` to
  `POST /api/reports` (field `photoUrl`) and the IncidentReport row keeps
  a real, viewable link — officials see the image, not just a filename.

Production upgrade notes: object storage (S3-compatible) with signed URLs
instead of local disk (swap `multer.diskStorage` in `src/lib/uploads.ts`),
and a real trained classifier (ONNX/TF.js) replacing the heuristic
`score()` — both isolated so the endpoint/DB shape doesn't change.

### Part B migration

```bash
npm run migrate     # applies prisma/migrations/*_add_report_photo_url (incident_reports."photoUrl")
```

### Part B acceptance check

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"official@setu-ner.demo","password":"demo"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 1. Upload two DIFFERENT images — note severity/confidence come from pixels:
curl -s -X POST http://localhost:4000/api/reports/photo -H "Authorization: Bearer $TOKEN" -F "photo=@landslide.jpg"
curl -s -X POST http://localhost:4000/api/reports/photo -H "Authorization: Bearer $TOKEN" -F "photo=@clear-road.jpg"
# 2. Create a report carrying the returned photoUrl:
curl -s -X POST http://localhost:4000/api/reports -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"landslide","severity":"impassable","description":"Slide across road","lat":25.16,"lng":93.01,"photoUrl":"/uploads/photos/P-....jpg"}'
# 3. The stored report now has a viewable image URL (open it in a browser):
curl -s http://localhost:4000/api/reports -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -i photourl
```

## Part C — credibility + problem-statement gaps

### Live vs simulated fleet

**This is the single most likely question judges ask — read this first.**

By default every vehicle in the fleet is 100% simulated: `engine/vehicles.ts`
moves each one along its route every 4s tick (`tick()`), the same as Parts
A/B. There is no real GPS hardware in the demo.

`POST /api/vehicles/:id/position` lets a real device report a genuine
position for one vehicle:

```bash
curl -s -X POST http://localhost:4000/api/vehicles/AS-01-MED-4471/position \
  -H 'Content-Type: application/json' \
  -H "x-device-token: $(node -e "console.log(require('crypto').createHmac('sha256', process.env.DEVICE_TOKEN_SECRET || 'dev-only-insecure-device-secret').update('AS-01-MED-4471').digest('hex').slice(0,32))")" \
  -d '{"lat":26.18,"lng":91.75,"speedKmph":42}'
```

Auth is a per-vehicle device token (`x-device-token` header, verified in
`middleware/deviceAuth.ts`), deliberately separate from the citizen/
official JWT used everywhere else — a tracker should never be able to do
anything beyond report its own vehicle's position. Tokens are deterministic
(HMAC of vehicle id + `DEVICE_TOKEN_SECRET`), so no provisioning step is
needed in the hackathon build; production should move to stored, revocable
per-device tokens (see `PRODUCTION.md`).

Once a live ping lands, `tick()` uses that position for that vehicle
instead of simulating it, for as long as pings keep arriving at least once
every 30s (`LIVE_PING_TIMEOUT_MS` in `engine/vehicles.ts`). If pings stop
(device goes offline), that vehicle automatically falls back to the
simulation on the next tick — nothing freezes or crashes. This means you
can demo "flip a switch, this one vehicle is now real GPS" live, without
the rest of the fleet demo depending on real hardware being present.

### AI/ML disclosure

`riskOf()` blends two genuinely different kinds of scoring:
- **Rule terms** (terrain, monsoon failure history, rainfall, sensor
  readings) — hand-weighted, explainable, NOT machine learning.
- **A learned term** (`ml/riskModel.ts`) — a logistic regression whose
  weights were actually trained (via gradient descent, see
  `scripts/train-risk-model.ts`) on a **synthetic** historical-failure
  dataset (`data/synthetic-failures.json`). There was no real labeled NER
  incident dataset available in a hackathon timeframe, so the training
  data is generated, not collected — this is disclosed here and in the
  code comments in `ml/riskModel.ts`. Swapping in real historical incident
  data means replacing the generator in the training script with a real
  loader and rerunning it; the inference interface doesn't change.

Call this a **hybrid rule + learned engine**, not an unqualified "AI"
claim — the UI copy in `PlanRoute.tsx`/`Dashboard.tsx` says exactly this.

### Congestion factor

`riskOf()` also includes a `congestion` term derived from live fleet
density (`GET /api/vehicles`, normalized against a per-road-type capacity
constant) — see the `congestion` field in `RiskBreakdown` and the segment
detail panels in `PlanRoute.tsx`/`Track.tsx`. This was previously the one
factor from the problem statement's Expected Solution with no answer in
the risk engine at all.

### GIS / government-system integration

`src/integrations/govtFeed.ts` defines a typed adapter interface
(`fetchRoadClosures()`, `fetchDistrictStock()`) with one mock
implementation reading from a local JSON fixture
(`src/integrations/fixtures/govt-feed.json`), exposed at
`GET /api/govt/road-closures` and `GET /api/govt/district-stock`
(`src/routes/govt-feed.ts`). This is explicitly a **contract, not a data
source** — swap in a real adapter calling a state PWD API or the NIC data
portal in production; nothing else in the app needs to change, since
routes only ever depend on the `GovtFeedAdapter` interface.

### Endpoints — Part C

- `POST /api/vehicles/:id/position` (device token, see above) — live GPS ingestion
- `GET /api/govt/road-closures` — mock govt-reported closures
- `GET /api/govt/district-stock?districtId=` — mock govt-reported stock levels
- `GET /api/segments/risk` and `POST /api/route-suggestion` (both pre-existing)
  now include `learned` and `congestion` in each segment's risk breakdown

### Part C acceptance check

```bash
# Learned + congestion factors show up in every segment's risk breakdown:
curl -s http://localhost:4000/api/segments/risk | python3 -m json.tool | grep -E "learned|congestion" | head

# Govt feed (mock):
curl -s http://localhost:4000/api/govt/road-closures
curl -s "http://localhost:4000/api/govt/district-stock?districtId=HFL"

# Live GPS ingestion (device token is HMAC(DEVICE_TOKEN_SECRET, vehicleId)):
VID=AS-01-MED-4471
TOKEN=$(node -e "console.log(require('crypto').createHmac('sha256', process.env.DEVICE_TOKEN_SECRET || 'dev-only-insecure-device-secret').update('$VID').digest('hex').slice(0,32))")
curl -s -X POST http://localhost:4000/api/vehicles/$VID/position \
  -H 'Content-Type: application/json' -H "x-device-token: $TOKEN" \
  -d '{"lat":26.18,"lng":91.75,"speedKmph":42}'
# -> { "ok": true, "vehicleId": "AS-01-MED-4471", "live": true }
# Wrong/missing token -> 401. Bad payload -> 400.
```

## Disaster situation-report analysis (Gemini or any OpenAI-compatible LLM)

`src/engine/analysis.ts` fuses the region's live signals — NDMA SACHET
government alerts, Open-Meteo weather, blocked/cut-off corridors, at-risk
fleet, per-segment risk scores and district stock gaps — into one structured
situation report (overall severity, affected districts, recommended
actions). Evidence is summarised to district level before it reaches the
model; raw vehicle/segment arrays are never sent.

- `GET /api/analysis/disaster` (auth) — the report + `analysisStatus()`.
  Cached for 5 minutes.
- `POST /api/analysis/disaster/refresh` (auth) — force a fresh run (the
  Disaster page's refresh button).
- `POST /api/analysis/test` (auth) — one-shot connectivity self-test: a tiny
  live "ping" to the configured provider. Returns `{ ok, provider, model,
  baseUrl, latencyMs, error? }` so the demo can prove the LLM is reachable in
  one command. Standalone equivalent (reads `server/.env`):
  `node_modules/.bin/tsx scripts/check-llm.ts`.

**Provider.** `ANALYSIS_PROVIDER` selects the model backend:

- `gemini` (default) — mirrors `lib/vision.ts`'s `callGemini()` and requests
  structured output via `responseMimeType` + `responseSchema`. Needs a paid
  `VISION_API_KEY` (`AIza…`).
- `openai` — any OpenAI-compatible `/chat/completions` endpoint, so the
  integration works **without Gemini billing**:

  ```bash
  # Groq free tier (recommended, no billing):
  ANALYSIS_PROVIDER="openai"
  ANALYSIS_MODEL="llama-3.3-70b-versatile"
  ANALYSIS_BASE_URL="https://api.groq.com/openai/v1"
  VISION_API_KEY="gsk_..."        # reuses the shared LLM-key variable
  ```

  The same three vars also work for OpenRouter free models, a local
  Ollama/LM Studio, etc. (`ANALYSIS_MODEL` overrides the model; defaults to
  `VISION_MODEL`). All three are documented in `.env.example`.

**Degrade, don't fail closed.** With `ANALYSIS_ENABLED=false`, no
`VISION_API_KEY`, or any network/parse/schema failure, the endpoint returns
a deterministic summary computed locally from the *same* inputs, marked
`live:false` with a `reason` — it never throws. The model's JSON reply is
validated with zod and district ids are normalised against the known
`DISTRICTS` (a hallucinated id is dropped). When Disaster Mode activates,
`routes/system.ts` pages the dispatcher with the report via
`waSituationReport()` (fire-and-forget).

### Analysis acceptance check

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"official@setu-ner.demo","password":"demo"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s http://localhost:4000/api/analysis/disaster -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# -> { "severity": "...", "summary": "...", "affectedDistricts": [...],
#      "recommendedActions": [...], "live": true|false, "model": "openai:llama-3.3-70b-versatile"|null,
#      "reason": null|"...", "generatedAt": "...", "status": { ... } }
```

## Part B — vehicle persistence (nice-to-have, done lightly)

The in-memory simulated fleet (position changes every 4 s) is snapshotted
to the `Vehicle` table every 15 ticks (~60 s, see `src/realtime.ts` →
`snapshotFleetToDb()` in `src/engine/vehicles.ts`), and the server resumes
from the last snapshot on boot (`initFleet()` in `src/index.ts`) instead of
jumping back to seed positions. Best-effort: if the DB is unreachable the
fleet simply starts from seeds. Shipment rows are left untouched — they
describe the original dispatch, and the sim only ever mutates vehicles.
