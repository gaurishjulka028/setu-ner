// `tsc` with rootDir ../.. (needed because prisma/seed.ts imports the
// frontend's data files) emits to dist/<parent-folder>/server/src/index.js,
// so the path depends on what the project folder is called. Find it.
const fs = require('fs')
const path = require('path')
function find(dir, depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return null
  const direct = path.join(dir, 'server', 'src', 'index.js')
  if (fs.existsSync(direct)) return direct
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const hit = find(path.join(dir, d.name), depth + 1)
    if (hit) return hit
  }
  return null
}
const entry = find(path.join(__dirname, '..', 'dist'))
if (!entry) { console.error('Built server not found — run `npm run build` first.'); process.exit(1) }
require(entry)
