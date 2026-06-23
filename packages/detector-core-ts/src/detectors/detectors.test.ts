import { describe, expect, it } from "vitest";
import { makeUnit, type AnalysisUnit } from "./base.js";
import { LLMFingerprintDetector } from "./llmFingerprint.js";
import { DocumentationDetector } from "./documentation.js";
import { StructureDetector } from "./structure.js";
import { makeScan } from "../ingestion/models.js";
import type { Signal } from "../models.js";

function unit(
  source: string,
  language = "python",
  kind = "file",
  extra: Partial<AnalysisUnit> = {},
): AnalysisUnit {
  return makeUnit({ source, language, path: "x", kind, name: "x", ...extra });
}

function byName(signals: Signal[]): Map<string, Signal> {
  return new Map(signals.map((s) => [s.name, s]));
}

describe("LLMFingerprintDetector", () => {
  it("flags generic / tutorial-style comments", () => {
    const src =
      "# This function calculates the result.\n" +
      "# Note that this is an example.\n" +
      "# First, we initialize the value.\n" +
      "def f(value_to_process):\n" +
      "    # Here we process the value\n" +
      "    processed_value = value_to_process + 1\n" +
      "    # Finally, we return the result\n" +
      "    return processed_value\n";
    const signals = byName(new LLMFingerprintDetector().unitSignals(unit(src)));
    expect(signals.has("generic_comments")).toBe(true);
    expect(signals.get("generic_comments")!.score).toBeGreaterThan(0.55);
  });

  it("flags placeholder implementations", () => {
    const src = "def f():\n    # TODO: implement\n    raise NotImplementedError\n" + "x=1\n".repeat(6);
    const signals = byName(new LLMFingerprintDetector().unitSignals(unit(src)));
    expect(signals.has("placeholder_implementations")).toBe(true);
  });
});

describe("DocumentationDetector", () => {
  it("detects marketing / chatbot wording", () => {
    const readme =
      "# My Project\n\n" +
      "This project is designed to harness the power of cutting-edge tech.\n" +
      "It is a robust and scalable, comprehensive solution.\n\n" +
      "## Features\n- one\n- two\n- three\n\n## Installation\n## Usage\n## Contributing\n## License\n";
    const signals = byName(
      new DocumentationDetector().unitSignals(
        unit(readme, "markdown", "file", { is_documentation: true }),
      ),
    );
    expect(signals.has("chatbot_wording")).toBe(true);
    expect(signals.get("chatbot_wording")!.score).toBeGreaterThan(0.5);
  });
});

describe("StructureDetector", () => {
  it("repetition directionality: repetitive >= varied", () => {
    const reps: string[] = [];
    for (let i = 0; i < 40; i++) reps.push(`value_${i} = compute(value_${i})`);
    const repetitive = unit(reps.join("\n"));
    const varied = unit(
      "import os\nx = os.getpid() ^ 7\nif x % 3:\n    y = [i*i for i in range(x)]\nelse:\n    y = None\nprint(y, x)\n",
    );
    const det = new StructureDetector();
    const rep = byName(det.unitSignals(repetitive));
    const va = byName(det.unitSignals(varied));
    if (rep.has("repetitive_patterns") && va.has("repetitive_patterns")) {
      expect(rep.get("repetitive_patterns")!.score).toBeGreaterThanOrEqual(
        va.get("repetitive_patterns")!.score,
      );
    }
  });

  it("uniform function lengths repo signal leans AI", () => {
    const units: AnalysisUnit[] = [];
    for (let i = 0; i < 12; i++) {
      units.push(
        makeUnit({
          source: Array(5).fill("x = 1").join("\n"),
          language: "python",
          path: `f${i}.py`,
          kind: "function",
          name: `fn${i}`,
        }),
      );
    }
    const scan = makeScan({ kind: "folder", name: "t", source: "." });
    const signals = byName(new StructureDetector().repoSignals(scan, units));
    expect(signals.has("uniform_function_lengths")).toBe(true);
    expect(signals.get("uniform_function_lengths")!.score).toBeGreaterThan(0.6);
  });
});
