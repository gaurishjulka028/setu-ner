// Best-effort `prisma generate`.
//
// Prisma 7's generate step validates the schema with a "schema engine"
// binary it downloads from binaries.prisma.sh — a host many Indian ISPs /
// office networks block, which used to make `npm install` fail here. The
// runtime itself does NOT need that binary (we use the pure-JS libsql
// adapter), so if the download fails we retry with
// PRISMA_SCHEMA_ENGINE_BINARY pointed at any existing executable (node
// itself): generate only checks the path exists, then produces the client
// from the schema without ever running the engine.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const out = path.join(__dirname, '..', 'src', 'generated', 'prisma', 'client.ts')
const run = env => spawnSync('npx', ['prisma', 'generate'], { stdio: 'inherit', shell: true, env: { ...process.env, ...env } })

let r = run({})
if (r.status !== 0) {
  console.warn('\n[setu-ner] prisma generate could not download its engine (network?). Retrying engine-free…')
  r = run({ PRISMA_SCHEMA_ENGINE_BINARY: process.execPath })
}
if (r.status !== 0 || !fs.existsSync(out)) {
  console.error('\n[setu-ner] prisma generate failed. The server cannot start without src/generated/prisma.')
  console.error('[setu-ner] Try:  PRISMA_SCHEMA_ENGINE_BINARY="$(node -e \'console.log(process.execPath)\')" npx prisma generate')
  console.error('[setu-ner] (Windows PowerShell:  $env:PRISMA_SCHEMA_ENGINE_BINARY=(Get-Command node).Source; npx prisma generate)\n')
  process.exit(0) // don't fail npm install itself
}
