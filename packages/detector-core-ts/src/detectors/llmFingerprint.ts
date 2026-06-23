/**
 * LLM fingerprint heuristics: tell-tale comments, placeholders, over-docs.
 *
 * These are the signals most specific to *generated* code as opposed to merely
 * clean code: tutorial-style narration, placeholder stubs, generic TODOs,
 * emoji in comments, and unusually high comment-to-code ratios.
 */

import { LLM_COMMENT_PHRASES, PLACEHOLDER_MARKERS } from "../constants.js";
import type { Signal } from "../models.js";
import { stripComments } from "../parsing/languages.js";
import { clamp } from "../utils/text.js";
import { percent0 } from "../utils/format.js";
import { Detector, unitLoc, type AnalysisUnit } from "./base.js";

// Mirror of the Python emoji character ranges.
export const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2740}-\u{27BF}]/gu;
const TODO_RE = /\b(todo|fixme|xxx|hack)\b/i;
const TODO_RE_G = /\b(todo|fixme|xxx|hack)\b/gi;

function pyRepr(s: string): string {
  // Mirror Python repr() for the common single-quoted-string case used here.
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export class LLMFingerprintDetector extends Detector {
  override name = "llm_fingerprint";
  override description =
    "Tell-tale LLM phrasings, placeholders, generic TODOs, over-documentation.";

  override unitSignals(unit: AnalysisUnit): Signal[] {
    if (unit.is_config || unitLoc(unit) < 5) return [];
    const [code, comments] = stripComments(unit.source, unit.language);
    const commentText = comments.join("\n").toLowerCase();
    const commentLines = comments.filter((c) => c.trim());
    const codeLines = code.split("\n").filter((ln) => ln.trim());
    const signals: Signal[] = [];

    // 1) Generic / tutorial-style comments.
    if (commentLines.length) {
      const hits = LLM_COMMENT_PHRASES.filter((p) => commentText.includes(p));
      const density = hits.length / Math.max(1, commentLines.length);
      const score = clamp(0.5 + 0.45 * clamp(density / 0.4) + 0.1 * clamp(hits.length / 6));
      const ev = [];
      if (hits.length) {
        const sample = this.firstCommentWith(comments, hits);
        ev.push(
          this.evidence(
            "generic_comments",
            `Comments use ${hits.length} phrasing(s) common in LLM output ` +
              `(e.g. ${hits.slice(0, 4).map(pyRepr).join(", ")}).`,
            { severity: score, path: unit.path, start_line: unit.start_line, snippet: sample },
          ),
        );
      }
      signals.push(
        this.signal("generic_comments", score, {
          confidence: clamp(commentLines.length / 15),
          weight: 1.3,
          reason:
            `${hits.length} LLM-typical comment phrase(s) over ` +
            `${commentLines.length} comment line(s).`,
          evidence: ev,
        }),
      );
    }

    // 2) Placeholder / stub implementations.
    const lowerAll = unit.source.toLowerCase();
    const phHits = PLACEHOLDER_MARKERS.filter((m) => lowerAll.includes(m));
    if (phHits.length) {
      const score = clamp(0.55 + 0.4 * clamp(phHits.length / 4));
      signals.push(
        this.signal("placeholder_implementations", score, {
          confidence: 0.55,
          weight: 1.1,
          reason: `Found placeholder/stub markers: ${phHits.slice(0, 4).map(pyRepr).join(", ")}.`,
          evidence: [
            this.evidence(
              "placeholder_implementations",
              `Placeholder/stub text present (${phHits.slice(0, 3).join(", ")}).`,
              { severity: score, path: unit.path, start_line: unit.start_line },
            ),
          ],
        }),
      );
    }

    // 3) Over-documentation: comment-to-code ratio far above typical.
    if (codeLines.length >= 10) {
      const ratio = commentLines.length / Math.max(1, codeLines.length);
      const score = clamp(0.5 + 0.4 * clamp((ratio - 0.35) / 0.6));
      if (ratio > 0.45) {
        signals.push(
          this.signal("excessive_documentation", score, {
            confidence: clamp(codeLines.length / 60),
            weight: 0.8,
            reason: `Comment-to-code ratio ${percent0(ratio)} (high).`,
            evidence: [
              this.evidence(
                "excessive_documentation",
                `Unusually high comment-to-code ratio (${percent0(ratio)}).`,
                { severity: score, path: unit.path },
              ),
            ],
          }),
        );
      }
    }

    // 4) Emoji in source comments.
    const emoji = commentText.match(EMOJI_RE);
    if (emoji && emoji.length) {
      const score = clamp(0.55 + 0.3 * clamp(emoji.length / 4));
      signals.push(
        this.signal("emoji_in_comments", score, {
          confidence: 0.5,
          weight: 0.6,
          reason: `${emoji.length} emoji found in code comments.`,
        }),
      );
    }

    // 5) Generic TODOs without specifics.
    const todos = commentText.match(TODO_RE_G);
    if (todos && todos.length) {
      const generic = comments.filter((c) => TODO_RE.test(c) && c.trim().length < 24).length;
      if (generic) {
        const score = clamp(0.5 + 0.25 * clamp(generic / 4));
        signals.push(
          this.signal("generic_todos", score, {
            confidence: 0.45,
            weight: 0.5,
            reason: `${generic} short/generic TODO-style comment(s).`,
          }),
        );
      }
    }

    return signals;
  }

  private firstCommentWith(comments: string[], phrases: string[]): string | null {
    for (const c of comments) {
      const low = c.toLowerCase();
      if (phrases.some((p) => low.includes(p))) return c.trim().slice(0, 200);
    }
    return null;
  }
}
