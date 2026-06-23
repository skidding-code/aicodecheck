/**
 * Highly speculative attribution of a likely generation *source*.
 *
 * This is the least reliable component in the system by a wide margin. It
 * returns LOW-confidence probabilities gated by the overall AI probability.
 * Never present these as fact.
 */

import { ATTRIBUTION_PROFILES } from "../constants.js";
import type { AttributionGuess } from "../models.js";
import { scanAnalyzable, type Scan } from "../ingestion/models.js";
import { stripComments } from "../parsing/languages.js";
import { clamp } from "../utils/text.js";

function pyRepr(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function estimateAttribution(
  scan: Scan,
  overallAiProbability: number,
): AttributionGuess[] {
  if (overallAiProbability < 0.45) return [];

  const corpus: string[] = [];
  for (const f of scanAnalyzable(scan).slice(0, 200)) {
    const [, comments] = stripComments(f.source, f.language);
    corpus.push(comments.join(" ").toLowerCase());
  }
  const blob = corpus.join(" ");
  if (!blob.trim()) return flatDistribution(overallAiProbability);

  const rawScores: Record<string, number> = {};
  const rationales: Record<string, string> = {};
  for (const [key, profile] of Object.entries(ATTRIBUTION_PROFILES)) {
    const hits = profile.phrases.filter((p) => blob.includes(p));
    let base = 0.2; // everyone gets a floor so we never claim certainty
    base += 0.15 * hits.length;
    rawScores[key] = base;
    rationales[key] = hits.length
      ? `matched phrasing ${hits.slice(0, 3).map(pyRepr).join(", ")}`
      : "no distinctive phrasing matched; included for completeness";
  }

  const total = Object.values(rawScores).reduce((a, b) => a + b, 0) || 1.0;
  const guesses: AttributionGuess[] = [];
  for (const [key, raw] of Object.entries(rawScores).sort((a, b) => b[1] - a[1])) {
    const prob = (raw / total) * overallAiProbability;
    guesses.push({
      source: key,
      probability: clamp(prob),
      rationale: `${ATTRIBUTION_PROFILES[key]!.label}: ${rationales[key]}.`,
      confidence: 0.15, // deliberately, permanently low
    });
  }
  return guesses;
}

function flatDistribution(overallAiProbability: number): AttributionGuess[] {
  const keys = Object.keys(ATTRIBUTION_PROFILES);
  const share = overallAiProbability / keys.length;
  return keys.map((k) => ({
    source: k,
    probability: clamp(share),
    rationale: `${ATTRIBUTION_PROFILES[k]!.label}: insufficient signal to differentiate.`,
    confidence: 0.1,
  }));
}
