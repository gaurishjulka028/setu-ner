// Offline trainer for the learned component of the risk model.
//
// Run manually with: npx tsx server/scripts/train-risk-model.ts
// (not called from the running server — this is a one-off training step,
// same as you'd run a Python training script outside your API process).
//
// What this does, honestly:
//   1. Generates a SYNTHETIC historical-failure dataset — segment features
//      (terrain, monsoon failure history, rainfall exposure, sensor
//      reading, single-lane flag, poor-condition flag) mapped to a
//      simulated "did this stretch fail" label. This is NOT real NER
//      incident data; there wasn't a labeled historical dataset available
//      in a hackathon timeframe, and we say so everywhere this matters
//      (UI copy, README, here).
//   2. Trains a plain logistic regression (hand-rolled batch gradient
//      descent, no ML library — 6 features is small enough that a library
//      would be overkill and would obscure what's actually happening).
//   3. Prints the learned weights, which are pasted into
//      server/src/ml/riskModel.ts as `LEARNED_WEIGHTS`.
//
// To retrain with real historical incident data: replace generateSyntheticData()
// below with a loader for the real dataset (same {terrain, histFactor,
// rainFactor, sensor, singleLane, poorCondition, label} shape), rerun, and
// paste the new weights into riskModel.ts. Nothing else needs to change —
// the interface (predictFailureProbability) stays the same.

import fs from 'fs'
import path from 'path'

interface TrainingRow {
  terrain: number       // 0-100, matches risk.ts terrain factor
  histFactor: number    // 0-100, matches risk.ts histFactor
  rainFactor: number    // 0-100, matches risk.ts rainFactor
  sensor: number        // 0-100, matches risk.ts sensor factor
  singleLane: number    // 0 or 1
  poorCondition: number // 0 or 1
  label: number          // 0 or 1 — did this (simulated) stretch fail?
}

function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function generateSyntheticData(n = 4000, seed = 42): TrainingRow[] {
  const rand = seededRandom(seed)
  const gauss = () => {
    let u = 0, v = 0
    while (u === 0) u = rand()
    while (v === 0) v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x))

  const rows: TrainingRow[] = []
  for (let i = 0; i < n; i++) {
    const terrain = clamp(rand() * 100)
    const histFactor = clamp(rand() * rand() * 100) // skewed toward low, like real seg data
    const rainFactor = clamp(rand() * 100)
    const sensor = clamp(rand() * 100)
    const singleLane = rand() < 0.3 ? 1 : 0
    const poorCondition = rand() < 0.25 ? 1 : 0

    // Simulated ground truth — deliberately includes a terrain×rain
    // interaction term the linear rule formula in risk.ts doesn't model,
    // so the learned component contributes something genuinely different
    // from the existing rule terms, not just a re-weighting of them.
    const logit = -4.2
      + 0.028 * terrain
      + 0.033 * histFactor
      + 0.031 * rainFactor
      + 0.026 * sensor
      + 0.55 * singleLane
      + 0.45 * poorCondition
      + 0.00025 * terrain * rainFactor
      + gauss() * 0.6
    const p = 1 / (1 + Math.exp(-logit))
    const label = rand() < p ? 1 : 0
    rows.push({ terrain, histFactor, rainFactor, sensor, singleLane, poorCondition, label })
  }
  return rows
}

function trainLogisticRegression(rows: TrainingRow[], epochs = 3000, lr = 0.5): number[] {
  // Features normalized to [0,1] for stable gradient descent; weights are
  // learned in this normalized space, and riskModel.ts normalizes inputs
  // the same way at inference time.
  const X = rows.map(r => [1, r.terrain / 100, r.histFactor / 100, r.rainFactor / 100, r.sensor / 100, r.singleLane, r.poorCondition])
  const y = rows.map(r => r.label)
  const m = X.length
  let w = new Array(7).fill(0)

  for (let e = 0; e < epochs; e++) {
    const grad = new Array(7).fill(0)
    for (let i = 0; i < m; i++) {
      const z = X[i].reduce((s, x, j) => s + x * w[j], 0)
      const pred = 1 / (1 + Math.exp(-z))
      const err = pred - y[i]
      for (let j = 0; j < 7; j++) grad[j] += err * X[i][j]
    }
    for (let j = 0; j < 7; j++) w[j] -= (lr / m) * grad[j]
  }
  return w
}

function evaluate(rows: TrainingRow[], w: number[]): number {
  const X = rows.map(r => [1, r.terrain / 100, r.histFactor / 100, r.rainFactor / 100, r.sensor / 100, r.singleLane, r.poorCondition])
  let correct = 0
  rows.forEach((r, i) => {
    const z = X[i].reduce((s, x, j) => s + x * w[j], 0)
    const pred = 1 / (1 + Math.exp(-z)) >= 0.5 ? 1 : 0
    if (pred === r.label) correct++
  })
  return correct / rows.length
}

function main() {
  const rows = generateSyntheticData()
  const outPath = path.join(__dirname, '..', 'data', 'synthetic-failures.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2))
  console.log(`Wrote ${rows.length} synthetic rows to ${outPath}`)

  const weights = trainLogisticRegression(rows)
  const acc = evaluate(rows, weights)
  console.log('Train accuracy (sanity check only — synthetic data, not a held-out eval):', acc.toFixed(4))
  console.log('\nPaste into server/src/ml/riskModel.ts LEARNED_WEIGHTS:')
  console.log(JSON.stringify(weights.map(x => Math.round(x * 10000) / 10000)))
}

main()
