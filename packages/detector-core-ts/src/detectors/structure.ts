/**
 * Code-structure heuristics: repetition, uniformity, boilerplate, symmetry.
 *
 * AI-generated codebases frequently exhibit *unusual regularity*. None of these
 * is conclusive alone, which is exactly why they are weighted signals.
 */

import type { Signal } from "../models.js";
import type { Scan } from "../ingestion/models.js";
import {
  clamp,
  coefficientOfVariation,
  compressibility,
  ngramRepetition,
  tokenize,
} from "../utils/text.js";
import { fixed, percent0 } from "../utils/format.js";
import { Detector, unitLoc, type AnalysisUnit } from "./base.js";

export class StructureDetector extends Detector {
  override name = "structure";
  override description = "Repetition, uniformity, boilerplate and structural symmetry.";

  override unitSignals(unit: AnalysisUnit): Signal[] {
    if (unit.is_documentation || unitLoc(unit) < 8) return [];
    const tokens = tokenize(unit.source);
    if (tokens.length < 30) return [];

    const rep = ngramRepetition(tokens, 4);
    const comp = compressibility(unit.source);
    // High repetition (rep up) and high compressibility (comp down) lean AI.
    const repComponent = clamp(rep / 0.35); // rep>=0.35 saturates
    const compComponent = clamp((0.55 - comp) / 0.45); // comp<=0.10 saturates
    const raw = 0.5 + 0.35 * (0.6 * repComponent + 0.4 * compComponent - 0.25);
    const score = clamp(raw);
    const confidence = clamp(tokens.length / 600);

    const ev = [];
    if (score > 0.58) {
      ev.push(
        this.evidence(
          "repetitive_patterns",
          `Repetitive token structure (4-gram repetition ${percent0(rep)}, ` +
            `compresses to ${percent0(comp)} of size).`,
          {
            severity: score,
            path: unit.path,
            start_line: unit.start_line,
            end_line: unit.end_line,
          },
        ),
      );
    }
    return [
      this.signal("repetitive_patterns", score, {
        confidence,
        weight: 1.0,
        reason: `4-gram repetition ${percent0(rep)}; compressibility ${percent0(comp)}.`,
        evidence: ev,
      }),
    ];
  }

  override repoSignals(_scan: Scan, units: AnalysisUnit[]): Signal[] {
    const signals: Signal[] = [];
    const funcUnits = units.filter(
      (u) => (u.kind === "function" || u.kind === "method") && unitLoc(u) > 1,
    );
    const fileUnits = units.filter((u) => u.kind === "file" && !u.is_documentation);

    // 1) Uniform function lengths.
    if (funcUnits.length >= 8) {
      const lengths = funcUnits.map((u) => unitLoc(u));
      const cv = coefficientOfVariation(lengths);
      const uniformity = clamp(1 - cv / 0.7);
      const score = clamp(0.4 + 0.45 * uniformity);
      const ev = [];
      if (uniformity > 0.6) {
        ev.push(
          this.evidence(
            "uniform_function_lengths",
            `Function lengths are unusually uniform across ${funcUnits.length} functions ` +
              `(coefficient of variation ${fixed(cv, 2)}; lower is more uniform).`,
            { severity: score },
          ),
        );
      }
      signals.push(
        this.signal("uniform_function_lengths", score, {
          confidence: clamp(funcUnits.length / 40),
          weight: 1.2,
          reason: `Function-length CV=${fixed(cv, 2)} over ${funcUnits.length} functions.`,
          evidence: ev,
        }),
      );
    }

    // 2) Uniform file sizes.
    if (fileUnits.length >= 6) {
      const sizes = fileUnits.map((u) => unitLoc(u));
      const cv = coefficientOfVariation(sizes);
      const uniformity = clamp(1 - cv / 0.9);
      const score = clamp(0.43 + 0.35 * uniformity);
      signals.push(
        this.signal("uniform_file_sizes", score, {
          confidence: clamp(fileUnits.length / 30),
          weight: 0.7,
          reason: `File-size CV=${fixed(cv, 2)} over ${fileUnits.length} files.`,
        }),
      );
    }

    // 3) Cross-file boilerplate / duplicated lines.
    const dup = this.duplicateLineRatio(fileUnits);
    if (dup !== null) {
      const score = clamp(0.45 + 0.5 * clamp(dup / 0.3));
      const ev = [];
      if (dup > 0.15) {
        ev.push(
          this.evidence(
            "repeated_boilerplate",
            `${percent0(dup)} of non-trivial lines are duplicated across files, ` +
              `suggesting templated/boilerplate reuse.`,
            { severity: score },
          ),
        );
      }
      signals.push(
        this.signal("repeated_boilerplate", score, {
          confidence: clamp(fileUnits.length / 20),
          weight: 1.0,
          reason: `Cross-file duplicated-line ratio ${percent0(dup)}.`,
          evidence: ev,
        }),
      );
    }

    return signals;
  }

  private duplicateLineRatio(fileUnits: AnalysisUnit[]): number | null {
    const counter = new Map<string, number>();
    let total = 0;
    for (const u of fileUnits) {
      for (const line of u.source.split("\n")) {
        const norm = line.trim();
        if (norm.length < 12 || norm === "});" || norm === "})" || norm === "return;") continue;
        counter.set(norm, (counter.get(norm) ?? 0) + 1);
        total += 1;
      }
    }
    if (total < 40) return null;
    let duplicated = 0;
    for (const c of counter.values()) if (c > 1) duplicated += c - 1;
    return duplicated / total;
  }
}
