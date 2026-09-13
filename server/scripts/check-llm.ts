// LLM connectivity self-test — run this at the venue to prove the configured
// disaster-analysis provider (Groq free tier by default) is reachable and the
// key is valid. Reads the same server/.env the app uses.
//
//   cd server && node_modules/.bin/tsx scripts/check-llm.ts
//
// Exits 0 when the provider answers, 1 otherwise. Never throws.
import 'dotenv/config'

async function main() {
  // Import AFTER dotenv/config so env is present when the module reads it.
  const { testProvider, analysisStatus } = await import('../src/engine/analysis')

  console.log('───────────────────────────────────────────────────')
  console.log('SETU-NER LLM self-test')
  console.log('───────────────────────────────────────────────────')
  console.log(`config: ${JSON.stringify(analysisStatus(), null, 2)}`)
  console.log(`base URL: ${process.env.ANALYSIS_BASE_URL ?? process.env.VISION_BASE_URL ?? 'https://api.groq.com/openai/v1'}`)
  console.log('calling provider (tiny "ping")…')

  const r = await testProvider()
  if (r.ok) {
    console.log(`✅ PASS — provider responded in ${r.latencyMs} ms (provider=${r.provider}, model=${r.model})`)
    console.log('The disaster situation report will be LIVE (AI-written).')
    process.exit(0)
  } else {
    console.log(`❌ FAIL — ${r.error}`)
    console.log(`provider=${r.provider} model=${r.model} baseUrl=${r.baseUrl}`)
    console.log('')
    console.log('Check:')
    console.log('  1. VISION_API_KEY in server/.env is a valid key for this provider')
    console.log('  2. The provider base URL is reachable from this network')
    console.log('  3. ANALYSIS_MODEL is a model the provider currently serves')
    console.log('')
    console.log('Meanwhile the report still renders via the deterministic local')
    console.log('summary (live:false) — the feature never hard-fails.')
    process.exit(1)
  }
}

main()
