/** Combine detector signals into a calibrated, explainable AIScore. */

import { isInformative, makeAIScore, type AIScore, type Classification, type Signal } from "../models.js";
import { clamp, logistic, mean, round, stdev } from "../utils/text.js";
import { DEFAULT_PROFILE, type CalibrationProfile } from "./calibration.js";

/** Map (probability, confidence) to a hedged classification bucket. */
export function classify(
  aiProbability: number,
  confidence: number,
  profile: CalibrationProfile,
): Classification {
  if (confidence < profile.min_confidence) return "uncertain";
  if (aiProbability >= profile.t_generated) return "likely_ai_generated";
  if (aiProbability >= profile.t_assisted_high) return "likely_ai_assisted";
  if (aiProbability >= profile.t_assisted_low) return "possibly_ai_assisted";
  if (aiProbability <= profile.t_human) return "likely_human";
  return "uncertain";
}

export interface CombineOptions {
  maxReasons?: number;
}

/**
 * Aggregate signals into an AIScore. Aggregation is a confidence-and-weight
 * weighted average of each signal's deviation from neutral (0.5). Confidence
 * reflects both the total amount of evidence and how much signals agree.
 */
export function combineSignals(
  signals: Signal[],
  profile: CalibrationProfile = DEFAULT_PROFILE,
  options: CombineOptions = {},
): AIScore {
  const maxReasons = options.maxReasons ?? 6;
  const informative = signals.filter(isInformative);
  if (informative.length === 0) {
    return makeAIScore({
      ai_probability: 0.5,
      human_probability: 0.5,
      confidence: 0.0,
      evidence_score: 0.0,
      risk_score: 0.0,
      classification: "uncertain",
      reasons: ["Not enough signal to form an estimate."],
    });
  }

  const effWeights: number[] = [];
  const deviations: number[] = [];
  for (const s of informative) {
    const mult = profile.weight_overrides[s.name] ?? 1.0;
    effWeights.push(s.weight * s.confidence * mult);
    deviations.push(s.score - 0.5);
  }

  const totalW = effWeights.reduce((a, b) => a + b, 0) || 1e-9;
  let weightedDev = 0;
  for (let i = 0; i < effWeights.length; i++) weightedDev += effWeights[i]! * deviations[i]!;
  weightedDev /= totalW;
  const aiProbability = clamp(0.5 + weightedDev * profile.gain);
  const humanProbability = clamp(1.0 - aiProbability);

  // Confidence: more total weight -> higher; more disagreement -> lower.
  const volume = logistic(totalW, 0.6, 4.0); // ~0.5 at totalW=4
  const agreement = deviations.length > 1 ? 1.0 - clamp(stdev(deviations) / 0.3) : 0.6;
  const confidence = clamp(volume * (0.5 + 0.5 * agreement));

  // Evidence score: amount + strength of concrete evidence items.
  const evItems = informative.flatMap((s) => s.evidence);
  const evStrength = evItems.length ? mean(evItems.map((e) => e.severity)) : 0.0;
  const evidenceScore = clamp(logistic(evItems.length, 0.5, 3.0) * (0.4 + 0.6 * evStrength));

  const riskScore = clamp(aiProbability * confidence);
  const classification = classify(aiProbability, confidence, profile);
  const reasons = topReasons(informative, effWeights, deviations, maxReasons);

  return makeAIScore({
    ai_probability: round(aiProbability, 4),
    human_probability: round(humanProbability, 4),
    confidence: round(confidence, 4),
    evidence_score: round(evidenceScore, 4),
    risk_score: round(riskScore, 4),
    classification,
    reasons,
  });
}

function topReasons(
  signals: Signal[],
  effWeights: number[],
  deviations: number[],
  limit: number,
): string[] {
  const ranked = signals
    .map((s, i) => ({ s, w: effWeights[i]!, dev: deviations[i]! }))
    .sort((a, b) => b.w * Math.abs(b.dev) - a.w * Math.abs(a.dev));
  const reasons: string[] = [];
  for (const { s, dev } of ranked) {
    if (!s.reason) continue;
    const lean = dev > 0 ? "leans AI" : "leans human";
    reasons.push(`[${s.name}, ${lean}] ${s.reason}`);
    if (reasons.length >= limit) break;
  }
  return reasons;
}
