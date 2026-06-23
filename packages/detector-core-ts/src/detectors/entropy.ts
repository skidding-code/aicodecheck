/**
 * Entropy and complexity-regularity heuristics.
 *
 *  * Token entropy: generated code is often slightly more predictable.
 *  * Complexity regularity: AI tends to produce functions of similar
 *    complexity, whereas human code has a heavier tail.
 */

import type { Signal } from "../models.js";
import type { Scan } from "../ingestion/models.js";
import { clamp, coefficientOfVariation, normalizedEntropy, tokenize } from "../utils/text.js";
import { fixed } from "../utils/format.js";
import { Detector, unitLoc, type AnalysisUnit } from "./base.js";

// Branch-introducing tokens used for an approximate cyclomatic complexity.
const BRANCH_RE = /\b(if|elif|else if|for|while|case|when|catch|except|&&|\|\||\?)\b|\?\s*[^:]+:/g;

export function approxCyclomatic(source: string): number {
  const matches = source.match(BRANCH_RE);
  return 1 + (matches ? matches.length : 0);
}

export class EntropyDetector extends Detector {
  override name = "entropy";
  override description = "Token entropy and complexity-distribution regularity.";

  override unitSignals(unit: AnalysisUnit): Signal[] {
    if (unit.is_documentation || unitLoc(unit) < 10) return [];
    const tokens = tokenize(unit.source);
    if (tokens.length < 40) return [];
    const ent = normalizedEntropy(tokens);
    // Empirically, human source clusters higher; map low entropy -> AI lean.
    const score = clamp(0.5 + 0.3 * clamp((0.82 - ent) / 0.25));
    return [
      this.signal("code_entropy", score, {
        confidence: clamp(tokens.length / 300),
        weight: 0.7,
        reason: `Normalized token entropy ${fixed(ent, 2)} (lower is more predictable).`,
      }),
    ];
  }

  override repoSignals(_scan: Scan, units: AnalysisUnit[]): Signal[] {
    const funcUnits = units.filter(
      (u) => (u.kind === "function" || u.kind === "method") && unitLoc(u) >= 3,
    );
    if (funcUnits.length < 10) return [];
    const complexities = funcUnits.map((u) => approxCyclomatic(u.source));
    const cv = coefficientOfVariation(complexities);
    const uniformity = clamp(1 - cv / 0.9);
    const score = clamp(0.44 + 0.4 * uniformity);
    const ev = [];
    if (uniformity > 0.6) {
      ev.push(
        this.evidence(
          "predictable_complexity",
          `Cyclomatic complexity is unusually uniform across ${funcUnits.length} functions ` +
            `(CV ${fixed(cv, 2)}); human code usually has a heavier tail of complex functions.`,
          { severity: score },
        ),
      );
    }
    return [
      this.signal("predictable_complexity", score, {
        confidence: clamp(funcUnits.length / 50),
        weight: 0.9,
        reason: `Complexity CV=${fixed(cv, 2)} across ${funcUnits.length} functions.`,
        evidence: ev,
      }),
    ];
  }
}
