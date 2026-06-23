/**
 * Authorship-artifact heuristics: the "too clean / too polished" tells.
 *
 * Mirrors the Python AuthorshipArtifactsDetector. Targets natural AI code that
 * lacks tutorial-style tells, via two empirically-derived signals:
 *   - absence of human maintenance artifacts (TODO/FIXME/noqa/commented code)
 *   - unusually polished, full-sentence comments
 *
 * These are weak, probabilistic signals (a meticulous human looks AI-like here)
 * and natural AI can evade them entirely — see docs/limitations.md.
 */

import type { Signal } from "../models.js";
import type { Scan } from "../ingestion/models.js";
import { scanAnalyzable } from "../ingestion/models.js";
import { clamp, mean } from "../utils/text.js";
import { stripComments } from "../parsing/languages.js";
import { fixed } from "../utils/format.js";
import { Detector, unitLoc, type AnalysisUnit } from "./base.js";

const ARTIFACT_RE = /\b(TODO|FIXME|HACK|XXX)\b/g;
const PRAGMA_RE = /(noqa|type:\s*ignore|pylint:|mypy:|pragma|# *type:)/g;
const WELLFORMED_RE = /^[A-Z][^\n]{6,}[.!?]$/;
const CODEISH_RE = /(=|\(|\)|\bdef\b|\bclass\b|\bimport\b|\breturn\b|\bself\.|\[|\])/;

function cleanComments(source: string, language: string): string[] {
  const [, comments] = stripComments(source, language);
  return comments.map((c) => c.trim()).filter((c) => c.length > 0);
}

function isCommentedCode(text: string): boolean {
  // No AST in the browser; a conservative structural heuristic (kept close to
  // the Python ast-based check so cross-engine parity holds on clean corpora).
  if (!CODEISH_RE.test(text)) return false;
  return /[;{}]\s*$/.test(text) || /^(def |class |import |from |return |if |for |while |[\w.]+\s*=)/.test(text);
}

function count(re: RegExp, s: string): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

export class AuthorshipArtifactsDetector extends Detector {
  override name = "authorship_artifacts";
  override description = "Absence of human maintenance artifacts and unusually polished comments.";

  override unitSignals(unit: AnalysisUnit): Signal[] {
    if (unit.is_documentation || unitLoc(unit) < 12) return [];
    const comments = cleanComments(unit.source, unit.language);
    if (comments.length < 4) return [];
    const wf = mean(comments.map((c) => (WELLFORMED_RE.test(c) ? 1 : 0)));
    const score = clamp(0.5 + 1.0 * (wf - 0.22));
    const ev = [];
    if (score > 0.62) {
      const sample = comments.find((c) => WELLFORMED_RE.test(c));
      ev.push(
        this.evidence(
          "comment_polish",
          `${Math.round(wf * 100)}% of comments are polished full sentences (humans tend ` +
            `to write terse, fragmentary comments).`,
          { severity: score, path: unit.path, start_line: unit.start_line, snippet: sample },
        ),
      );
    }
    return [
      this.signal("comment_polish", score, {
        confidence: clamp(comments.length / 8),
        weight: 1.3,
        reason: `${Math.round(wf * 100)}% of comments are complete, well-formed sentences.`,
        evidence: ev,
      }),
    ];
  }

  override repoSignals(scan: Scan, _units: AnalysisUnit[]): Signal[] {
    const files = scanAnalyzable(scan).filter((f) => !f.is_documentation);
    const totalLoc = files.reduce((a, f) => a + f.source.split("\n").length, 0);
    if (totalLoc < 40) return [];
    const full = files.map((f) => f.source).join("\n");
    const kloc = Math.max(0.3, totalLoc / 1000);
    const artifacts = (count(ARTIFACT_RE, full) + count(PRAGMA_RE, full)) / kloc;

    const score = clamp(0.585 - 0.5 * Math.min(artifacts, 1.0));
    const ev = [];
    if (artifacts < 0.05 && totalLoc > 150) {
      ev.push(
        this.evidence(
          "missing_human_artifacts",
          `No human maintenance artifacts (TODO/FIXME/noqa/commented-out code) found across ` +
            `${totalLoc} lines; human codebases of this size usually contain some.`,
          { severity: score },
        ),
      );
    }
    const signals: Signal[] = [
      this.signal("missing_human_artifacts", score, {
        confidence: clamp(totalLoc / 600),
        weight: 1.0,
        reason: `${fixed(artifacts, 2)} maintenance artifacts per KLOC (absence leans AI; presence leans human).`,
        evidence: ev,
      }),
    ];

    const lang = scan.files.some((f) => f.language === "python") ? "python" : "javascript";
    const comments = cleanComments(full, lang);
    if (comments.length >= 8) {
      const cc = mean(comments.map((c) => (isCommentedCode(c) ? 1 : 0)));
      signals.push(
        this.signal("no_commented_out_code", clamp(0.54 - 1.3 * cc), {
          confidence: clamp(comments.length / 25),
          weight: 0.5,
          reason: `${Math.round(cc * 100)}% of comments are commented-out code (absence leans AI).`,
        }),
      );
    }
    return signals;
  }
}
