import { describe, expect, it } from "vitest";
import { analyzeSnippet, analyzeFiles } from "./index.js";
import { Engine } from "./engine.js";
import { loadFiles } from "./ingestion/loader.js";

const AI_ISH = `
# This function calculates the sum of two numbers.
# Note that this is a simple example to demonstrate the concept.
def calculate_sum_of_two_numbers(first_number, second_number):
    """Calculate and return the sum of the two provided numbers.

    This function takes two numbers as input and returns their sum.
    """
    # First, we add the two numbers together
    result_of_addition = first_number + second_number
    # Finally, we return the result
    return result_of_addition
`;

const HUMAN_ISH = `
import sys, re
def p(x):
    m = re.match(r"(\\d+)", x)  # fixme: brittle
    return int(m.group(1)) * 2 - 1 if m else None
for l in sys.stdin:
    v = p(l.strip())
    if v and v % 3:
        print(v)
`;

describe("engine / public API", () => {
  it("snippet directionality: AI-ish scores higher than human-ish", () => {
    const ai = analyzeSnippet(AI_ISH, { filename: "ai.py" });
    const human = analyzeSnippet(HUMAN_ISH, { filename: "human.py" });
    expect(ai.overall_ai_probability).toBeGreaterThan(human.overall_ai_probability);
  });

  it("result is JSON serializable with wire-compatible keys", () => {
    const result = analyzeSnippet(AI_ISH, { filename: "ai.py" });
    const payload = JSON.parse(JSON.stringify(result));
    expect(payload.disclaimer).toBeTruthy();
    expect("overall_ai_probability" in payload).toBe(true);
    expect(payload.classification).toBeTruthy();
    expect("human_probability" in payload).toBe(true);
    expect("visualizations" in payload).toBe(true);
    expect("recommendations" in payload).toBe(true);
    expect("generated_at" in payload).toBe(true);
  });

  it("always includes the disclaimer", () => {
    expect(analyzeSnippet("x = 1\n").disclaimer).toBeTruthy();
  });

  it("empty input is safe (uncertain or likely_human)", () => {
    const result = analyzeSnippet("");
    expect(["uncertain", "likely_human"]).toContain(result.classification);
  });

  it("analyzeFiles processes multiple files and produces a heatmap", () => {
    const result = analyzeFiles({ "a.py": AI_ISH, "b.py": HUMAN_ISH });
    expect(result.target.analyzed_files).toBe(2);
    expect(result.files.length).toBe(2);
    expect(result.visualizations.file_heatmap.length).toBeGreaterThan(0);
  });

  it("Engine.analyze(scan) returns a bounded probability and an id", () => {
    const scan = loadFiles({ "x.py": AI_ISH, "y.py": HUMAN_ISH });
    const result = new Engine().analyze(scan);
    expect(result.overall_ai_probability).toBeGreaterThanOrEqual(0.0);
    expect(result.overall_ai_probability).toBeLessThanOrEqual(1.0);
    expect(result.id).toBeTruthy();
    expect(result.elapsed_seconds).toBeGreaterThanOrEqual(0.0);
  });
});
