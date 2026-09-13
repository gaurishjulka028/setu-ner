// The learned component of the risk model.
//
// Everything else in engine/risk.ts (terrain/history/rain/sensor factors)
// is a hand-weighted rule formula — useful, explainable, but not AI/ML.
// This module is the honest "AI" piece: a small logistic regression whose
// weights were LEARNED (not hand-picked) from a training run, and it's
// blended into riskOf() as one additional factor alongside the rule terms.
//
// Weights learned via `server/scripts/train-risk-model.ts` from
// `server/data/synthetic-failures.json` (SYNTHETIC data — there was no
// real labeled historical-incident dataset available in a hackathon
// timeframe; this is disclosed in server/README.md and the UI tooltip).
// Swap in real historical incident data in production: replace the
// generator in train-risk-model.ts with a loader for the real dataset
// (same feature shape), rerun, paste the new weights below — nothing else
// needs to change.
//
// Order: [bias, terrain, histFactor, rainFactor, sensor, singleLane, poorCondition]
const LEARNED_WEIGHTS = [-4.2745, 3.4883, 3.2791, 3.5989, 2.6117, 0.4841, 0.3816]

export interface LearnedInput {
  terrain: number        // 0-100, same scale as risk.ts's terrain factor
  histFactor: number     // 0-100
  rainFactor: number     // 0-100
  sensor: number          // 0-100
  singleLane: boolean
  poorCondition: boolean
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

/**
 * Returns a learned failure probability in [0, 1] for the given segment
 * conditions. Inputs are normalized to [0,1] the same way training did
 * (continuous features /100, flags as 0/1) before the weights are applied.
 */
export function predictFailureProbability(input: LearnedInput): number {
  const x = [
    1,
    input.terrain / 100,
    input.histFactor / 100,
    input.rainFactor / 100,
    input.sensor / 100,
    input.singleLane ? 1 : 0,
    input.poorCondition ? 1 : 0,
  ]
  const z = x.reduce((sum, xi, i) => sum + xi * LEARNED_WEIGHTS[i], 0)
  return sigmoid(z)
}

/**
 * Same prediction, rescaled to 0-100 so it composes directly with the
 * other 0-100 risk factors in riskOf().
 */
export function learnedRiskFactor(input: LearnedInput): number {
  return Math.round(predictFailureProbability(input) * 100)
}
