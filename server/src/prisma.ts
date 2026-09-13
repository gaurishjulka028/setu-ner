import fs from 'fs'
import path from 'path'
import { PrismaClient } from './generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

// Prisma 7 + libsql driver adapter: the SQLite driver ships as an npm
// package, so no query-engine binary has to be downloaded from
// binaries.prisma.sh at install time (which many ISPs / office networks
// block — the most common "backend won't start" report for this project).
//
// DATABASE_URL stays in the classic "file:./dev.db" form (relative to the
// prisma/ folder, like Prisma <7 resolved it) so existing .env files work.
// Locates the server project root (the folder holding prisma/schema.prisma)
// whether we're running from src/ via tsx or from dist/.../src via node.
export function serverRoot(): string {
  let dir = __dirname
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) return dir
    dir = path.dirname(dir)
  }
  return process.cwd()
}

export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL || 'file:./dev.db'
  if (!raw.startsWith('file:')) return raw
  const p = raw.slice('file:'.length)
  if (path.isAbsolute(p)) return raw
  const abs = path.resolve(serverRoot(), 'prisma', p)
  return `file:${abs}`
}

// Single shared instance — avoids exhausting SQLite connections in dev
// with hot-reload creating a new client on every file change.
const adapter = new PrismaLibSql({ url: resolveDatabaseUrl() })
export const prisma = new PrismaClient({ adapter })
