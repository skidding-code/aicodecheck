import { describe, expect, it } from "vitest";
import { classify, combineSignals } from "./ensemble.js";
import { DEFAULT_PROFILE } from "./calibration.js";
import { makeSignal, type Signal } from "../models.js";

function sig(name: string, score: number, confidence: number): Signal {
  return makeSignal({ name, detector: "d", score, weight: 1.0, confidence, reason: "r" });
}

describe("ensemble", () => {
  it("empty signals are neutral + uncertain", () => {
    const score = combineSignals([]);
    expect(score.classification).toBe("uncertain");
    expect(score.ai_probability).toBe(0.5);
    expect(score.confidence).toBe(0.0);
  });

  it("strong agreement raises probability and confidence", () => {
    const signals = Array.from({ length: 6 }, (_, i) => sig(`s${i}`, 0.85, 0.9));
    const score = combineSignals(signals);
    expect(score.ai_probability).toBeGreaterThan(0.6);
    expect(score.confidence).toBeGreaterThan(0.4);
    expect(score.human_probability).toBe(Math.round((1 - score.ai_probability) * 10000) / 10000);
  });

  it("disagreement lowers confidence", () => {
    const agree = Array.from({ length: 6 }, (_, i) => sig(`a${i}`, 0.8, 0.9));
    const disagree = Array.from({ length: 6 }, (_, i) => sig(`d${i}`, i % 2 ? 0.9 : 0.1, 0.9));
    expect(combineSignals(agree).confidence).toBeGreaterThan(combineSignals(disagree).confidence);
  });

  it("classify thresholds", () => {
    const p = DEFAULT_PROFILE;
    expect(classify(0.9, 0.8, p)).toBe("likely_ai_generated");
    expect(classify(0.55, 0.8, p)).toBe("possibly_ai_assisted");
    expect(classify(0.3, 0.8, p)).toBe("likely_human");
    // Low confidence always yields uncertain regardless of probability.
    expect(classify(0.95, 0.1, p)).toBe("uncertain");
  });

  it("risk score is prob x confidence", () => {
    const signals = Array.from({ length: 5 }, (_, i) => sig(`s${i}`, 0.8, 0.9));
    const score = combineSignals(signals);
    const expected = Math.round(score.ai_probability * score.confidence * 10000) / 10000;
    expect(Math.abs(score.risk_score - expected)).toBeLessThan(1e-3);
  });
});
