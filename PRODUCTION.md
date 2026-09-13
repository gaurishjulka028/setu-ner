# SETU-NER — production readiness notes

This is a hackathon build: SQLite + local-disk uploads + env-file secrets,
by design, to keep setup to `npm install && npm run dev`. None of that is
wrong for a prototype, but it's not what you'd ship. This document is the
honest answer to "is this actually cloud-ready?" — what would change, and
why the current build was written so that each change is isolated rather
than a rewrite.

No code changes are included here on purpose: making these changes before
the deadline would have traded working demo time for infrastructure that
judges never see directly. Every item below was written with this
migration in mind from the start (see the specific file/line pointers).

## 1. Database: SQLite → Postgres

Current: `server/prisma/schema.prisma` uses `provider = "sqlite"` with a
local `dev.db` file (`DATABASE_URL="file:./dev.db"` in `.env`).

To migrate:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
# .env
DATABASE_URL="postgresql://user:password@host:5432/setu_ner?schema=public"
```

```bash
npx prisma migrate dev --name postgres_migration
npm run seed
```

Nothing else changes: every model in `schema.prisma` uses only
cross-database-portable types (String/Float/Boolean, with JSON-shaped
data stored as `String` — a SQLite-specific workaround already, see the
`// JSON-encoded (SQLite has no native Json type)` comments throughout the
schema). Postgres has a real `Json` column type; switching those fields
from `String` to `Json` is optional cleanup, not required for the
migration to work.

Managed Postgres (RDS, Cloud SQL, Neon, Supabase, etc.) is the practical
choice — none of the app logic depends on being self-hosted.

## 2. File storage: local disk → object storage + signed URLs

Current: `POST /api/reports/photo` writes uploaded incident photos to
`<server>/uploads/photos/` on local disk (`server/src/lib/uploads.ts`,
multer's `diskStorage`), served back unauthenticated via Express static
middleware (`app.use('/uploads', express.static(...))` in
`server/src/index.ts`) — fine for a single-instance demo, but photos don't
survive a redeploy and there's no access control on who can view them.

To migrate:
- Swap `multer.diskStorage` in `lib/uploads.ts` for `multer-s3` (or
  equivalent) targeting an S3-compatible bucket (AWS S3, Cloudflare R2,
  MinIO for self-hosted).
- Store the object key instead of a local path on `IncidentReport.photoUrl`.
- Generate signed/expiring URLs (`getSignedUrl` from
  `@aws-sdk/s3-request-presigner` or equivalent) when serving a report to
  a client, instead of the current permanent public `/uploads/...` URL.
- Remove the `express.static('/uploads', ...)` mount entirely once nothing
  reads from local disk.

This is isolated: `lib/photo.ts` (the pixel-analysis heuristic) and every
route/DB field that references `photoUrl` are unaffected — they only ever
see a URL string, not how it was produced.

## 3. Secrets management

Current: `server/.env` (gitignored, `.env.example` checked in as a
template) holds:
- `JWT_SECRET` — signs citizen/operator/logistics/official/admin login
  tokens (`server/src/middleware/auth.ts`)
- `DEVICE_TOKEN_SECRET` — derives per-vehicle GPS-ingestion tokens
  (`server/src/middleware/deviceAuth.ts`, added in Part C)
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — WhatsApp dispatch
  (`server/src/lib/whatsapp.ts`) and sign-up OTP SMS (`server/src/lib/otp.ts`)
- `OTP_SECRET` (defaults to `JWT_SECRET`) — HMACs OTP codes and signs the
  15-minute `phoneToken` proof
- `VISION_API_KEY` — Groq / OpenRouter / OpenAI / Gemini key for photo AI and
  the situation report (`server/src/lib/vision.ts`, `engine/analysis.ts`)
- `DATABASE_URL`

### Auth in production

Two registration paths, one compulsory phone check:
- **Citizen / Driver (operator) / Logistics Company** — email + password
  (`POST /api/auth/register`). Companies must register on a company domain
  (Gmail/Yahoo/Outlook free-mail is rejected). Passwords: ≥ 8 chars with a
  letter + number, bcrypt-hashed.
- **MDoNER Official** — Google sign-in through Firebase with a `*.gov.in` /
  `*.nic.in` address ONLY. The server verifies the Firebase-issued id_token
  (signature via Google's public JWKS + issuer + audience against
  `FIREBASE_PROJECT_ID`), then re-checks the domain. A non-gov Google account
  can never become an official (and `expectOfficial` requests are rejected).
- **Admin** — seeded only, never self-registered.

Every account (all roles, both paths) must first verify its mobile number
with a 6-digit OTP — the 15-minute `phoneToken` proof is presented to
`/api/auth/register` and `/api/auth/google`.

Before going live:
- Set `OTP_CHANNEL=sms` with a Twilio **paid** account (or a DLT-registered
  Indian SMS route) — Twilio trials only deliver to verified numbers.
- Set `NODE_ENV=production` (or `OTP_DEV_ECHO=false`) so codes are never
  returned to the browser.
- OTP codes live in the `otp_codes` table (HMAC'd, attempt-counted) — the
  old in-memory store is gone. `FIREBASE_PROJECT_ID` must match the
  frontend's `VITE_FIREBASE_PROJECT_ID` or every Firebase sign-in is
  rejected on the audience check.
- The Firebase project's *Authorized domains* must include your deployed
  hostname, and Google Cloud's OAuth consent screen must be published.

To migrate: move all of the above into a real secrets manager (AWS
Secrets Manager, GCP Secret Manager, HashiCorp Vault, or even your
platform's encrypted env vars — Render/Railway/Fly all support this) and
inject them as process env vars at deploy time instead of a checked-out
`.env` file. `src/index.ts` and every module above already read secrets
via `process.env.*` (via `dotenv/config` locally) — nothing in the app
needs to know where the value came from, so this is a deploy-config
change, not a code change.

Also for production: rotate `JWT_SECRET` and `DEVICE_TOKEN_SECRET` off
their `.env.example` placeholder values (`change-this-in-production-please`
/ `dev-only-insecure-device-secret`) before any real deployment, and move
device tokens from the current deterministic-HMAC scheme to stored,
revocable per-device tokens issued at hardware-provisioning time (a
`DeviceToken` table, checked in `requireDeviceToken` instead of
recomputed) — the deterministic scheme is fine for a hackathon demo where
every "device" is really a curl command, but a real fleet needs tokens
that can be revoked if a tracker is lost or compromised without rotating
every other vehicle's token too.

## 4. Not covered here (already handled, or out of scope)

- **Learned risk model**: already isolated behind `predictFailureProbability()`
  in `ml/riskModel.ts` — moving from the synthetic training set to real
  historical incident data is a training-script change (see that file's
  header comment), not an infra change.
- **Govt/GIS feed**: already isolated behind `GovtFeedAdapter` in
  `integrations/govtFeed.ts` — swapping the mock for a real PWD/NIC
  adapter is a one-class change, not infra.
- **Horizontal scaling of the vehicle simulation/socket layer**
  (`realtime.ts`) — the current single-process in-memory fleet with
  periodic DB snapshotting would need a shared store (Redis) for the live
  fleet state if the API ever runs as more than one instance. Not
  addressed here since it's a bigger architectural change than the three
  above, and out of scope for what the problem statement asks for.
