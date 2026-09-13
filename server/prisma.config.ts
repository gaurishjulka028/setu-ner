import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 config: schema + migrations location, seed command, and the
// datasource URL used by `prisma migrate` / `prisma db push`.
//
// DATABASE_URL is read from process.env (loaded by dotenv/config above)
// with a safe fallback so `prisma generate` still works on a fresh clone
// BEFORE server/.env exists — otherwise `env('DATABASE_URL')` throws and the
// `npm install` postinstall silently leaves src/generated/prisma unbuilt.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
})

