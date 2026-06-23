/**
 * Stylometric heuristics: naming, formatting, descriptiveness, vocabulary.
 *
 * CAVEAT: many style features are confounded by auto-formatters and linters, so
 * these signals carry modest weights and their reasons name the confound.
 */

import type { Signal } from "../models.js";
import type { Scan } from "../ingestion/models.js";
import {
  clamp,
  identifiers,
  mean,
  namingConvention,
  splitIdentifier,
  stdev,
  typeTokenRatio,
} from "../utils/text.js";
import { fixed, percent0 } from "../utils/format.js";
import { Detector, unitLoc, type AnalysisUnit } from "./base.js";

const ROUND_WIDTHS = [79, 80, 88, 99, 100, 120];

export class StylometryDetector extends Detector {
  override name = "stylometry";
  override description =
    "Naming conventions, formatting regularity, identifier descriptiveness.";

  override unitSignals(unit: AnalysisUnit): Signal[] {
    if (unit.is_documentation || unitLoc(unit) < 6) return [];
    const idents = identifiers(unit.source);
    const signals: Signal[] = [];

    // 1) Identifier descriptiveness: LLMs favor verbose, multi-word names.
    if (idents.length >= 12) {
      const wordCounts = idents.map((i) => splitIdentifier(i).length);
      const charLens = idents.map((i) => i.length);
      const avgWords = mean(wordCounts);
      const avgLen = mean(charLens);
      const descriptiveness =
        clamp((avgWords - 1.3) / 1.4) * 0.6 + clamp((avgLen - 6) / 10) * 0.4;
      const score = clamp(0.45 + 0.4 * descriptiveness);
      const ev = [];
      if (descriptiveness > 0.6) {
        const longest = Array.from(new Set(idents))
          .sort((a, b) => b.length - a.length)
          .slice(0, 5);
        ev.push(
          this.evidence(
            "descriptive_naming",
            `Identifiers are unusually descriptive (avg ${fixed(avgWords, 1)} words / ` +
              `${avgLen.toFixed(0)} chars). Examples: ${longest.join(", ")}.`,
            { severity: score, path: unit.path, start_line: unit.start_line },
          ),
        );
      }
      signals.push(
        this.signal("descriptive_naming", score, {
          confidence: clamp(idents.length / 80),
          weight: 0.9,
          reason: `Avg identifier ${fixed(avgWords, 1)} words / ${avgLen.toFixed(0)} chars.`,
          evidence: ev,
        }),
      );
    }

    // 2) Naming-convention consistency (confounded by linters -> low weight).
    if (idents.length >= 15) {
      const conventions = new Map<string, number>();
      for (const i of idents) {
        const c = namingConvention(i);
        conventions.set(c, (conventions.get(c) ?? 0) + 1);
      }
      conventions.delete("other");
      if (conventions.size > 0) {
        const counts = Array.from(conventions.values());
        const dominant = Math.max(...counts);
        const totalConv = counts.reduce((a, b) => a + b, 0);
        const consistency = dominant / totalConv;
        const score = clamp(0.47 + 0.25 * clamp((consistency - 0.7) / 0.3));
        signals.push(
          this.signal("naming_consistency", score, {
            confidence: clamp(idents.length / 120) * 0.7,
            weight: 0.4,
            reason:
              `${percent0(consistency)} of identifiers share one convention ` +
              `(note: also explained by linters).`,
          }),
        );
      }
    }

    // 3) Formatting regularity: line lengths clustered and near round widths.
    signals.push(...this.formattingSignal(unit));

    // 4) Vocabulary richness (type-token ratio); very low -> templated.
    const toks = identifiers(unit.source);
    if (toks.length >= 40) {
      const ttr = typeTokenRatio(toks);
      const score = clamp(0.5 + 0.3 * clamp((0.45 - ttr) / 0.35));
      signals.push(
        this.signal("vocabulary_richness", score, {
          confidence: clamp(toks.length / 200),
          weight: 0.5,
          reason: `Identifier type-token ratio ${fixed(ttr, 2)} (lower is more repetitive).`,
        }),
      );
    }

    return signals;
  }

  private formattingSignal(unit: AnalysisUnit): Signal[] {
    const lines = unit.source.split("\n").filter((ln) => ln.trim());
    if (lines.length < 10) return [];
    const lengths = lines.map((ln) => ln.length);
    const sd = stdev(lengths);
    const m = mean(lengths);
    const regularity = clamp(1 - sd / (m + 1e-9) / 0.7);
    const nearRound =
      lengths.filter((l) => ROUND_WIDTHS.some((w) => Math.abs(l - w) <= 1)).length / lengths.length;
    const score = clamp(0.46 + 0.25 * regularity + 0.2 * clamp(nearRound / 0.15));
    return [
      this.signal("formatting_regularity", score, {
        confidence: clamp(lines.length / 80) * 0.7,
        weight: 0.4,
        reason:
          `Line-length stdev ${sd.toFixed(0)}; ${percent0(nearRound)} of lines near a round width ` +
          `(note: also explained by auto-formatters).`,
      }),
    ];
  }

  override repoSignals(_scan: Scan, units: AnalysisUnit[]): Signal[] {
    const fileUnits = units.filter(
      (u) => u.kind === "file" && !u.is_documentation && unitLoc(u) > 8,
    );
    if (fileUnits.length < 6) return [];
    const perFileMean: number[] = [];
    for (const u of fileUnits) {
      const ls = u.source.split("\n").filter((x) => x.trim()).map((x) => x.length);
      if (ls.length) perFileMean.push(mean(ls));
    }
    if (perFileMean.length < 6) return [];
    const cv = stdev(perFileMean) / (mean(perFileMean) + 1e-9);
    const uniformity = clamp(1 - cv / 0.5);
    const score = clamp(0.47 + 0.25 * uniformity);
    return [
      this.signal("cross_file_style_uniformity", score, {
        confidence: clamp(fileUnits.length / 40) * 0.8,
        weight: 0.6,
        reason: `Per-file mean line length CV=${fixed(cv, 2)} across ${fileUnits.length} files.`,
      }),
    ];
  }
}
