# SETU-NER server — clean setup & troubleshooting

Quick reference for getting the backend running from a fresh clone,
including fixes for the most common `prisma migrate dev` / install errors.

## 1. One-time setup (copy-paste, in order)

```bash
cd setu-ner-updated/server

# a) create your env file (it is gitignored — you must make it locally)
cp .env.example .env

# b) install dependencies
npm install

# c) create prisma/dev.db, apply migrations, load demo data
npm run setup        # = npm run migrate && npm run seed

# d) start the API
npm run dev
```

Then start the frontend in a second terminal:

```bash
cd setu-ner-updated/setu-ner
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173 — demo logins (password `demo` for all):
`citizen@setu-ner.demo`, `official@setu-ner.demo`, `operator@setu-ner.demo`,
`logistics@setu-ner.demo`, `admin@setu-ner.demo`

Quick check the API is up: `curl localhost:4000/api/health` → `{"ok":true}`

## 2. No more Prisma engine downloads

Older versions of this project ran `prisma generate` / `prisma migrate dev`,
which download engine binaries from `binaries.prisma.sh`. That host is
blocked on many networks, and the resulting failure showed up as
"login error", "booking error" and "find best route" errors because the
server could not talk to the database at all.

The server now uses Prisma 7 with the `@prisma/adapter-libsql` driver:
- the SQLite driver comes from npm — nothing is downloaded at runtime
- the client in `src/generated/prisma` is produced by `npm install`
  (`scripts/postinstall.js`). If `binaries.prisma.sh` is blocked on your
  network the script automatically retries **engine-free** — you'll see
  "Retrying engine-free…" and then "Generated Prisma Client". If it still
  fails, run it yourself:
  `PRISMA_SCHEMA_ENGINE_BINARY="$(node -e 'console.log(process.execPath)')" npx prisma generate`
  (PowerShell: `$env:PRISMA_SCHEMA_ENGINE_BINARY=(Get-Command node).Source; npx prisma generate`)
- migrations are applied by `npm run migrate` (`scripts/migrate.ts`), which
  reads `prisma/migrations/*/migration.sql` directly

`npm install` still *tries* `prisma generate` and prints a warning if it
can't; that warning is harmless. Only re-run `npm run prisma:generate`
after editing `prisma/schema.prisma` (needs network once).

## 3. Common errors

### "JWT_SECRET is not set" / "Environment variable not found: DATABASE_URL"
You skipped step (a). Run `cp .env.example .env` inside `server/` first.

### "no such table: users" / login returns 500
You skipped step (c). Run `npm run setup`.

### "Invalid credentials" on a demo account
The DB exists but has no users — run `npm run seed`.

### DB got into a weird state (old schema, half-applied migration)
The database is throwaway local data — reset it cleanly:

```bash
cd setu-ner-updated/server
rm -f prisma/dev.db prisma/dev.db-journal
npm run setup
```

### Frontend says "Failed to fetch" / network error
- Make sure the API terminal shows `SETU-NER API listening on http://localhost:4000`.
- Open the app at **http://localhost:5173** (not your LAN IP) *or* leave
  `VITE_API_URL` unset so the Vite proxy is used — see `setu-ner/.env.example`.
- If you changed `PORT` in `server/.env`, change `BACKEND` in
  `setu-ner/vite.config.ts` too.

### "Unknown origin/destination" from Find best route
The route endpoint accepts network town names (`Guwahati`, `Imphal`, …) or
district codes (`GHY`, `IMP`, …). The error response lists every known node.

### `npm install` fails
- `ETARGET` / version not found → `npm cache clean --force`, retry.
- `ERESOLVE` → delete `node_modules` + `package-lock.json`, run `npm install` again.

## 4. If the app starts but photo upload fails

- Error "Attach a photo as multipart field" / 415 → use a JPEG or PNG file.
- Error "Photo too large" → keep it under 12 MB.
- If the report is created but no photo shows: check
  `setu-ner-updated/server/uploads/photos/` exists (it is created
  automatically on first upload; the folder is gitignored).

## 5. WhatsApp trigger + webhook (Feature 4)

Runs **simulated by default**: report / booking / high-severity-alert hooks
write dispatcher messages to the server console and to
`GET /api/whatsapp/outbox` (status at `GET /api/whatsapp/status`). No env
needed. To send real messages set all three (see `.env.example`):

```bash
TWILIO_ACCOUNT_SID=…        TWILIO_AUTH_TOKEN=…
TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
WHATSAPP_DISPATCHER_TO="919876543210"   # who receives triggers
```

Webhook demo (also works simulated — replies straight from booking data):

```bash
curl -X POST localhost:4000/api/whatsapp/webhook \
  -H 'Content-Type: application/json' \
  -d '{"From":"whatsapp:+919876543210","Body":"TRACK B-<bookingId>"}'
```

## 6. Still stuck?

Run these and paste the output:

```bash
cd setu-ner-updated/server
node -v && npm -v
ls .env && cat .env | grep -v JWT_SECRET
npm run setup            # paste the FULL error
curl localhost:4000/api/health
```
