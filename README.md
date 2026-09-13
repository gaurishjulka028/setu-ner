# SETU-NER — NER Logistics Accessibility Platform

Two apps, fully integrated:

| Folder | What | Port |
|---|---|---|
| `server/` | Express + Prisma (SQLite) API, Socket.IO live fleet feed, JWT auth | 4000 |
| `setu-ner/` | React + Vite PWA (map, route planner, tracking, reports, bookings, dashboard) | 5173 |

## Run it (fresh clone → working app in 5 commands)

You need **Node.js 18+** (20 or 22 recommended) and **npm**. Nothing else —
no database server, no external accounts, no engine downloads.

**Terminal 1 — API**

```bash
cd setu-ner-updated/server
cp .env.example .env      # Windows PowerShell: copy .env.example .env
npm install
npm run setup             # creates prisma/dev.db, applies migrations, seeds demo data
npm run dev               # → SETU-NER API listening on http://localhost:4000
```

**Terminal 2 — Web app**

```bash
cd setu-ner-updated/setu-ner
cp .env.example .env
npm install
npm run dev               # → http://localhost:5173
```

Open **http://localhost:5173**. Real users sign in with **Google + an
OTP-verified mobile number** (see *Sign-in* below); for a quick look, expand
*Demo accounts* on the login screen and click a role. Demo accounts
(password `demo`, pre-verified phone):

| Role | Email | Can do |
|---|---|---|
| Citizen | `citizen@setu-ner.demo` | Report incidents (with photo), track, bookings |
| Operator | `operator@setu-ner.demo` | Same as citizen + fleet views |
| Logistics | `logistics@setu-ner.demo` | + Supply-gap analyzer |
| Official | `official@setu-ner.demo` | + Command dashboard, verify reports, disaster mode |
| Admin | `admin@setu-ner.demo` | Everything |

Health check: `curl http://localhost:4000/api/health` → `{"ok":true}`.

## What works end-to-end

- **Login** — real JWT issued by the API; a stale/expired token signs you out cleanly.
- **Find Best Route** — server-side risk engine (terrain + rainfall + failure history +
  sensors + live congestion + learned model). Accepts town names or district codes;
  clear error messages instead of silent failures.
- **Start Tracking / Apply New Route** — creates a real shipment in the shared,
  server-simulated fleet (`POST /api/shipments`). Survives refresh and restarts;
  visible to every user; moves on the map over the live socket feed.
- **Incident reports** — photo upload + pixel-analysis severity read, persisted.
  `partial` / `impassable` reports immediately mark the road *caution* / *blocked*
  for **everyone** (map colours, route planner, chatbot, alerts) via a live
  `segments:status` push. Officials verify/reject; rejecting lifts the block.
- **Bookings** — persisted; last-mile requests are matched to a community carrier;
  perishable cargo shows spoilage risk from the engine ETA; last-mile confirmation
  closes the loop and marks the vehicle delivered.
- **Dashboard** — live KPIs, stock from `GET /api/stock`, and *Review & Send*
  actually logs a high-severity alert and dispatches over the WhatsApp channel.
- **Alerts** — generated server-side every 4 s from weather/risk/fleet state,
  deduped, persisted; read/resolve synced.
- **Disaster situation report** — `GET /api/analysis/disaster` fuses govt
  alerts + weather + road blockages + at-risk fleet + stock gaps into an
  AI-written report (severity, affected districts, actions) on the Disaster
  page. Runs on Gemini or any OpenAI-compatible endpoint (Groq free tier /
  OpenRouter / local Ollama — no billing needed); falls back to a
  deterministic local summary when no provider is reachable.
- **Map** — basemap tiles come from Stadia Maps "Alidade" (the only tile
  provider; `tile.openstreetmap.org` blocks browser apps that don't follow
  its usage policy). The key ships in `setu-ner/.env.example` as
  `VITE_STADIA_API_KEY` (browser-exposed, public by design) — `cp
  .env.example .env` before `npm run dev`.
- **Offline** — reports queue in IndexedDB and flush when back online; app shell
  and tiles cached by the service worker (production build).
- **WhatsApp** — simulated by default (server log + `GET /api/whatsapp/outbox`).
  Set `TWILIO_*` in `server/.env` to send for real.

## Sign-in: Google + OTP-verified phone

There is **no e-mail/password registration**. The flow every real user goes
through on `/login`:

1. **Continue with Google** — the Firebase popup signs them into their Google
   account; the server verifies the id_token against Google's public
   tokeninfo endpoint (`POST /api/auth/google`). Google has already verified
   the e-mail, so we never need to send verification mails ourselves.
2. **Phone number** — for a brand-new account (or an old one that has never
   verified a phone) the server answers `needsPhone`, and the page asks for
   a 10-digit Indian mobile number → `POST /api/auth/otp/send`.
3. **6-digit code** — delivered by **SMS** (Twilio) or **WhatsApp** (the
   transport already used for alerts). With neither configured the server
   runs in *simulated* mode: the code is printed in the server log **and
   shown on the login page** (dev only, `OTP_DEV_ECHO`) so the whole flow
   still works offline. `POST /api/auth/otp/verify` returns a 15-minute
   `phoneToken`.
4. The Google popup opens once more and the account is created with
   `phone` + `phoneVerifiedAt` set. Next time, step 1 alone signs them in.

Role comes from the Google e-mail: `*.gov.in` / `*.nic.in` → **official**,
everyone else → **citizen**. Operator / logistics / admin are granted by an
admin — never self-claimed. Seeded `<role>@setu-ner.demo` accounts keep the
password login for demos and the curl acceptance checks
(`POST /api/auth/login`); `POST /api/auth/register` now returns **410 Gone**.

The Firebase **web** config for project `new-project-6e761` is already wired
in (built into `setu-ner/src/lib/firebase.ts`, also in
`setu-ner/.env.example` — web API keys are public identifiers, not secrets).
Two one-time switches in the
[Firebase console](https://console.firebase.google.com/project/new-project-6e761/authentication/providers)
make the popup work:

1. **Authentication → Sign-in method →** enable **Google** as a provider.
2. **Authentication → Settings → Authorized domains →** add every host you
   open the app from (e.g. your deployed domain / tunnel host). `localhost`
   is authorized by default, so local testing needs nothing extra.

To send real codes set in `server/.env` either
`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_SMS_FROM` (SMS; free
trial credit, trial accounts can only text numbers you verified in the
Twilio console) or any WhatsApp transport (Meta test number is free). Run
`cd server && npx tsx scripts/verify-google-auth.ts` for a 27-check
regression of the whole flow against a stub Google endpoint.

## Real vehicle tracking (phone or SIM tracker)

The map draws a vehicle from **real GPS** whenever a fix arrived in the last
30 s, and from the simulation otherwise (badge `GPS` vs `SIM`). Three ways to
feed real fixes:

**A. Driver's phone, no install** — log in as operator/logistics/official on
the phone, open **Track**, select the vehicle, tap **Share this device's
GPS**. The browser posts `navigator.geolocation` fixes every 3 s to
`POST /api/vehicles/:id/position/driver` (JWT). Browsers only expose
geolocation on **HTTPS or localhost**, so on a LAN either open the app
through an HTTPS tunnel (`cloudflared tunnel --url http://localhost:5173`,
`ngrok http 5173`) or your deployed HTTPS domain.

**B. Tracker app (Traccar Client / OsmAnd / GPSLogger)** — install
*Traccar Client* (free, Android/iOS), and set:

| Setting | Value |
|---|---|
| Server URL | `https://<your-host>/api/tracker/osmand?token=<device token>` |
| Device identifier | the vehicle id, e.g. `AS-01-MED-4471` |
| Frequency | 5–10 s |

Then tap *Start* — the app keeps sending in the background, screen off. Get
the token (and this exact URL, pre-filled) as official/admin from
`GET /api/vehicles/:id/device-token`.

**C. SIM-based hardware tracker** (Teltonika FMB, Concox/Jimi GT06, Ruptela,
any ₹1,500–4,000 4G OBD/wired unit) — pick one that supports the **OsmAnd /
HTTP** protocol and point it at the same URL as B; the endpoint accepts both
`GET` with query params and form-encoded `POST`, exactly what these units
send (`id, lat, lon, speed` in knots, `bearing`, `timestamp`). Units that
only speak a binary protocol (GT06, Teltonika Codec 8) should be pointed at
a **Traccar server** (open source, one `docker run`), whose *Forwarding →
OsmAnd/URL* option relays every position to this endpoint with the same
token — SETU-NER never needs to speak 200 tracker dialects itself. Any
custom firmware can also `POST /api/vehicles/:id/position` JSON
`{lat,lng,speedKmph,headingDeg}` with an `x-device-token` header.

Tokens are per-vehicle HMACs of `DEVICE_TOKEN_SECRET`; a device can only
ever report its own vehicle. `GET /api/vehicles/telemetry` lists which
vehicles are live right now.

## Incident-photo AI — free provider

Uploaded incident photos are classified (landslide / flood / debris /
damage / accident, passability, confidence) by a vision model; unrelated
photos get low relevance so they can't block a corridor. Gemini is **not**
required — the recommended setup is Groq's free tier (no card):

```bash
# server/.env
VISION_PROVIDER="groq"
VISION_API_KEY="gsk_…"      # console.groq.com → API Keys (free)
```

That preset uses `qwen/qwen3.6-27b` (image + text) and also powers the
disaster situation report (`ANALYSIS_PROVIDER` follows `VISION_PROVIDER`,
text preset `openai/gpt-oss-120b`). Alternatives: `openrouter`
(`google/gemma-4-31b-it:free`), `ollama` (fully offline, `ollama pull
qwen2.5vl`), `openai`, `gemini`. Check `GET /api/reports/vision-status`;
with nothing configured the built-in pixel heuristic runs, which is honest
but cannot recognise objects.

## What is LIVE vs simulated (read this before a demo)

Every map has a **Live / GPS / Weather / Roads** legend bottom-right — click
it. It shows the server's own report (`GET /api/data-sources`) of what is
real *right now*, so you never have to guess:

| Layer | Source when online | When offline | How to tell |
|---|---|---|---|
| **Vehicle positions** | Real GPS fixes from a driver's phone (Track → *Share this device's GPS*) or a hardware tracker (`POST /api/vehicles/:id/position`) — for those vehicles the simulation is bypassed | Server simulation along the planned corridor, 4 s tick, `SIM_TIME_SCALE`× real time (default 20×) | `GPS` (green) / `SIM` (grey) badge on every truck; popup says *REAL GPS* or *SIMULATED* |
| **Road shapes** | All 40 corridors ship at **full routing detail** (OpenStreetMap via OSRM, 8 m tolerance, ~900 vertices per corridor — every bend and hairpin; `server/data/road-geometry.json`) — the map is on real roads even with no internet. Re-snap any time with the **Refresh road geometry** GitHub Action (Actions tab → *Run workflow*, commits the new cache), `npx tsx scripts/refresh-geometry.ts --force`, or `POST /api/segments/geometry/refresh` `{force:true}` as official/admin. Providers: **Stadia Maps routing** (`STADIA_API_KEY`) first, **public OSRM** fallback | Nothing — the schematic curves only appear if the cache file is deleted and *both* routing services are unreachable | Legend → *Roads*; `GET /api/segments/geometry` → `source`, `byProvider`, `fullDetail` |
| **Rain / risk colours** | Open-Meteo forecast for 9 NER stations → risk engine, refreshed every 5 min and pushed over the socket | Monsoon baseline table | Legend → *Weather* |
| **Official alerts** | NDMA SACHET CAP RSS feed (IMD · CWC · SDMAs), polled every 10 min | Bundled sample, labelled *Offline copy* | Alerts page badge; ↻ to retry |
| **Road status** (blocked/caution) | Field reports verified by officials + risk engine | same (persisted) | — |
| **Routes** | Computed per request on the server: Dijkstra over risk-weighted corridors (rules + learned model) | same (server-side, no external API) | — |
| **Alerts / WhatsApp** | Generated server-side; delivered via Meta Cloud API or Twilio when configured | Simulated outbox (`GET /api/whatsapp/outbox`) | `GET /api/whatsapp/status` |

The seeded 14-vehicle fleet is **simulated by design** (there is no
hardware). To put a real vehicle on the map during a demo: log in as
*operator* on a phone, open **Track**, select a vehicle, tap **Share this
device's GPS** and walk/drive — the truck turns green and follows you for
everyone watching.

### Government alerts — how to "activate" them

Nothing to sign up for. The API server polls
`https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml` (NDMA's
public India CAP feed, ETag-cached as their integration guide requires). It
just needs **outbound internet from the machine running `server/`**. The NIC
host is slow — the first poll can take ~20 s; the Alerts page badge flips
from *Offline copy* to *LIVE feed* automatically (or press ↻).

### WhatsApp — how to send for real

Default is a simulated transport so everything works offline. For real
messages configure **one** provider in `server/.env` (full comments in
`.env.example`):

**Meta WhatsApp Cloud API** (official, free test number)
1. developers.facebook.com → *My Apps* → *Create app* → type *Business* → add the *WhatsApp* product.
2. *API Setup*: copy the **temporary access token** and **Phone number ID**; add your own phone under *To* as a test recipient (you'll get a code on WhatsApp).
3. `.env`: `WHATSAPP_PROVIDER=meta`, `META_WA_TOKEN=…`, `META_WA_PHONE_NUMBER_ID=…`, `WHATSAPP_DISPATCHER_TO=91XXXXXXXXXX`.
4. For inbound `TRACK <id>` replies: expose the server (`ngrok http 4000`), set *Webhook* callback URL to `https://<ngrok-host>/api/whatsapp/webhook`, verify token `setu-ner-verify` (or `META_WA_VERIFY_TOKEN`), subscribe to **messages**.

**Twilio sandbox** (fastest — 5 minutes)
1. console.twilio.com → *Messaging* → *Try it out* → *Send a WhatsApp message*; from your phone send the shown `join <word>` to **+1 415 523 8886**.
2. `.env`: `WHATSAPP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"`, `WHATSAPP_DISPATCHER_TO=91XXXXXXXXXX`.
3. Inbound: set the sandbox *When a message comes in* URL to `https://<ngrok-host>/api/whatsapp/webhook` (POST).

Restart the API; `GET /api/whatsapp/status` shows `transport: meta|twilio`.
Triggers: booking confirmed (also to the shipper's number if entered on the
form), high-severity alert, incident report, Disaster Mode, Dashboard
*Review & Send*. Inbound: `TRACK <booking id>` → live status + Google Maps
link of the vehicle.

## Optional things you can configure

| Setting | Where | Effect |
|---|---|---|
| `VITE_STADIA_API_KEY` | `setu-ner/.env` | Nicer basemap (free key at stadiamaps.com). **Tiles only** — shipped to the browser, so treat it as public |
| `STADIA_API_KEY` | `server/.env` | **Primary road-geometry source**: Stadia Maps routing API (Valhalla) snaps all 40 corridors to real highways. Server-side only — never reaches the browser bundle. Without it the server falls back to the public OSRM demo server |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM`, `WHATSAPP_DISPATCHER_TO` | `server/.env` | Real WhatsApp messages |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | `server/.env` | Token signing (change for any shared deployment) |
| `DEVICE_TOKEN_SECRET` | `server/.env` | Real GPS trackers → `POST /api/vehicles/:id/position` or `GET/POST /api/tracker/osmand` (officials read a vehicle's token + ready-made Traccar URL at `GET /api/vehicles/:id/device-token`) |
| `VISION_PROVIDER` + `VISION_API_KEY` | `server/.env` | Real photo AI — `groq` (free) recommended; `openrouter`, `ollama`, `openai`, `gemini` also supported. Same key drives the disaster situation report |
| `OTP_CHANNEL`, `TWILIO_SMS_FROM` | `server/.env` | How sign-up OTPs go out: `sms` (Twilio), `whatsapp` (existing transport), `simulated` (dev; code shown on screen) |
| `GEOMETRY_THIN_TOLERANCE_M` / `GEOMETRY_MAX_POINTS` | `server/.env` | Road-shape detail when re-snapping (default 8 m / 2500 points per corridor) |
| `SIM_TIME_SCALE` | `server/.env` | Simulation speed for vehicles without GPS (default 20× — a 6 h corridor plays in ~18 min; `1` = real time; seeded trucks loop, see `SIM_LOOP_SEEDED`) |
| `SIM_LOOP_SEEDED` | `server/.env` | `true` (default): seeded demo trucks restart their corridor 3 min after arriving so the map never empties; shipments you start yourself never loop |
| `OSRM_URL` / `STADIA_ROUTING_URL` / `STADIA_COSTING` / `ROAD_GEOMETRY_DISABLED` | `server/.env` | Own OSRM instance (the road-snapping fallback) / Stadia endpoint (e.g. `https://api-eu.stadiamaps.com`) / routing profile (`auto`, `truck`) / keep schematic geometry |
| `WHATSAPP_PROVIDER` + `META_WA_*` or `TWILIO_*` | `server/.env` | Real WhatsApp (see above) |
| `GOVT_ALERTS_URL` / `GOVT_ALERTS_POLL_MIN` | `server/.env` | Alternate CAP feed (e.g. a state SDMA) / poll interval |
| `PORT` / `CORS_ORIGIN` | `server/.env` | Change API port (also update `BACKEND` in `setu-ner/vite.config.ts`) |

## Troubleshooting

- **"Could not reach the API server"** on login, or **"Could not start tracking"** on
  Plan Route → Terminal 1 isn't running, or it's on a different port. Check
  `http://localhost:4000/api/health`. The toast now says exactly which case it is
  (server unreachable / session expired / server rejected the route / DB error).
- **Sent back to the login page with "session expired" / bounced off the Dashboard even
  as admin** → the browser still holds a token the API no longer accepts. Two causes:
  (1) the token is older than 8 h (`JWT_EXPIRES_IN`), or (2) **the API was restarted
  with a different `JWT_SECRET`** — e.g. you ran an older copy of the server, edited
  `server/.env`, or ran `cp .env.example .env` again. Every browser session signed by
  the old secret becomes invalid at once. The login page now tells you which of the two
  it was. Fix: just sign in again; keep one `server/.env` and don't change `JWT_SECRET`
  between runs. Your login *is* backed by the server (`/api/auth/login` → JWT → every
  protected call), so a wrong/rotated secret is the only way "admin" gets a 401.
- **Two frontends open (e.g. :5173 and :5174)** → Vite picked :5174 because :5173 was
  already taken by another copy of the app. Both talk to the same API on :4000 but keep
  separate logins (localStorage is per-origin) — close one of them.
- **Road lines not on the roads** → you are running a server that started before
  `server/data/road-geometry.json` existed, or an old copy of the repo. `git pull`,
  restart the API, and check the map legend says *Roads: real highway geometry 40/40*.
- **Legend says roads are at reduced detail (`n/40 at full routing detail`, n < 40)**
  → an old cache. `git pull` (the committed cache is 40/40 full detail) or run the
  *Refresh road geometry* GitHub Action / `cd server && npx tsx
  scripts/refresh-geometry.ts --force`. Set `STADIA_API_KEY` in `server/.env` if the
  public OSRM server is blocked on your network.
- **"Location sharing needs HTTPS"** on a phone → browsers only give GPS to secure
  pages. Use an HTTPS tunnel or your deployed domain, or use the Traccar Client app
  (see *Real vehicle tracking*), which has no such restriction.
- **OTP code never arrives** → check `GET /api/auth/otp/status`. `simulated` means no
  SMS/WhatsApp provider is configured — the code is in the server log and on the login
  page. On a Twilio *trial*, the destination number must be verified in the Twilio
  console first.
- **"Demo account not found"** → run `npm run setup` in `server/`.
- **Database looks wrong / half-migrated** → `rm server/prisma/dev.db` then
  `npm run setup` again (local data only).
- **Opened the app on a LAN IP / phone and API calls fail** → leave `VITE_API_URL`
  unset (default) so requests go through the Vite proxy same-origin.
- More in `server/SETUP.md`.

## Production build

```bash
cd server   && npm run build && npm start        # API from dist/
cd setu-ner && npm run build && npm run preview  # static app on :4173 (proxies /api to :4000)
```

See `PRODUCTION.md` for the Postgres / object-storage / secrets migration path.
