import en from '../src/i18n/en'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return f.endsWith('.tsx') || f.endsWith('.ts') ? [p] : walk(p)
  })
}

const files = [...walk('src/pages'), ...walk('src/components'), ...walk('src/store')]
const found = new Set<string>()
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bt\(\s*['"`]([\w.]+)['"`]/g)) found.add(m[1])
}
function has(obj: any, path: string) { return path.split('.').every(p => (obj = obj?.[p]) !== undefined) }
const missing = [...found].filter(k => !has(en, k))
console.log('keys used:', found.size, '| MISSING:', missing.length ? missing : 'none')
