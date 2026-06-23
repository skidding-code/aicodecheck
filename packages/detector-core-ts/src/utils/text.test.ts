import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  compressibility,
  namingConvention,
  ngramRepetition,
  normalizedEntropy,
  scaleBetween,
  splitIdentifier,
  typeTokenRatio,
} from "./text.js";

describe("text utils", () => {
  it("entropy bounds", () => {
    expect(normalizedEntropy([])).toBe(0.0);
    expect(normalizedEntropy(["a", "a", "a"])).toBe(0.0);
    // two equally-likely symbols => normalized entropy 1.0
    expect(Math.abs(normalizedEntropy(["a", "b", "a", "b"]) - 1.0)).toBeLessThan(1e-9);
  });

  it("ngram repetition", () => {
    expect(ngramRepetition(Array.from("abcabcabc"), 3)).toBeGreaterThan(0.0);
    expect(ngramRepetition(Array.from("abcdef"), 3)).toBe(0.0);
  });

  it("compressibility: repetitive is lower than varied", () => {
    const repetitive = compressibility("ab".repeat(500));
    const varied = compressibility("the quick brown fox jumps over the lazy dog 12345 zyxwv");
    expect(repetitive).toBeLessThan(varied);
  });

  it("coefficient of variation: uniform is low", () => {
    expect(coefficientOfVariation([10, 10, 10, 10])).toBe(0.0);
    expect(coefficientOfVariation([1, 50, 3, 99, 2])).toBeGreaterThan(0.5);
  });

  it("naming convention", () => {
    expect(namingConvention("snake_case_name")).toBe("snake_case");
    expect(namingConvention("camelCaseName")).toBe("camelCase");
    expect(namingConvention("PascalCase")).toBe("PascalCase");
    expect(namingConvention("UPPER_CASE")).toBe("UPPER_CASE");
    expect(namingConvention("kebab-case")).toBe("kebab-case");
  });

  it("split identifier", () => {
    expect(splitIdentifier("calculateSumOfTwoNumbers")).toEqual([
      "calculate",
      "Sum",
      "Of",
      "Two",
      "Numbers",
    ]);
    expect(splitIdentifier("result_of_addition")).toEqual(["result", "of", "addition"]);
  });

  it("type token ratio", () => {
    expect(typeTokenRatio(["a", "a", "a"])).toBeLessThan(typeTokenRatio(["a", "b", "c"]));
  });

  it("scale between", () => {
    expect(scaleBetween(5, 0, 10)).toBe(0.5);
    expect(scaleBetween(-5, 0, 10)).toBe(0.0);
    expect(scaleBetween(99, 0, 10)).toBe(1.0);
    expect(scaleBetween(5, 5, 5)).toBe(0.5);
  });
});
