/**
 * Documentation / README heuristics.
 *
 * Generated READMEs tend to be glossy and formulaic: marketing adjectives,
 * dense bullet lists, emoji-decorated headings, and the same canonical section
 * layout (Features / Installation / Usage / Contributing / License).
 */

import { GENERIC_README_SECTIONS, LLM_DOC_PHRASES } from "../constants.js";
import type { Signal } from "../models.js";
import { clamp } from "../utils/text.js";
import { percent0 } from "../utils/format.js";
import { Detector, unitLoc, type AnalysisUnit } from "./base.js";
import { EMOJI_RE } from "./llmFingerprint.js";

const HEADING_RE = /^#{1,6}\s+(.*)$/gm;
const BULLET_RE = /^\s*([-*+]|\d+\.)\s+/gm;

function pyRepr(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export class DocumentationDetector extends Detector {
  override name = "documentation";
  override description =
    "README/Markdown phrasing, bullet/emoji density, formulaic structure.";

  override unitSignals(unit: AnalysisUnit): Signal[] {
    if (!unit.is_documentation || unitLoc(unit) < 6) return [];
    const text = unit.source;
    const low = text.toLowerCase();
    const lines = text.split("\n").filter((ln) => ln.trim());
    if (lines.length < 6) return [];
    const signals: Signal[] = [];

    // 1) Marketing / chatbot phrasing.
    const hits = LLM_DOC_PHRASES.filter((p) => low.includes(p));
    const phraseScore = clamp(0.5 + 0.4 * clamp(hits.length / 6));
    const ev = [];
    if (hits.length) {
      ev.push(
        this.evidence(
          "chatbot_wording",
          `Documentation uses ${hits.length} marketing/LLM-typical phrase(s): ` +
            `${hits.slice(0, 5).map(pyRepr).join(", ")}.`,
          { severity: phraseScore, path: unit.path },
        ),
      );
    }
    signals.push(
      this.signal("chatbot_wording", phraseScore, {
        confidence: clamp(lines.length / 40),
        weight: 1.1,
        reason: `${hits.length} marketing/LLM-typical doc phrase(s).`,
        evidence: ev,
      }),
    );

    // 2) Bullet density.
    const bullets = (text.match(BULLET_RE) ?? []).length;
    const bulletRatio = bullets / Math.max(1, lines.length);
    const bscore = clamp(0.5 + 0.3 * clamp((bulletRatio - 0.3) / 0.4));
    if (bulletRatio > 0.3) {
      signals.push(
        this.signal("excessive_bullets", bscore, {
          confidence: clamp(lines.length / 40),
          weight: 0.6,
          reason: `${percent0(bulletRatio)} of lines are bullet points.`,
        }),
      );
    }

    // 3) Emoji density.
    const emoji = text.match(EMOJI_RE);
    if (emoji && emoji.length) {
      const escore = clamp(0.5 + 0.3 * clamp(emoji.length / 8));
      signals.push(
        this.signal("excessive_emoji", escore, {
          confidence: 0.5,
          weight: 0.6,
          reason: `${emoji.length} emoji in documentation.`,
          evidence:
            emoji.length >= 4
              ? [
                  this.evidence(
                    "excessive_emoji",
                    `${emoji.length} emoji used in documentation/headings.`,
                    { severity: escore, path: unit.path },
                  ),
                ]
              : [],
        }),
      );
    }

    // 4) Formulaic section layout.
    const headings = Array.from(text.matchAll(HEADING_RE)).map((m) => m[1]!.trim().toLowerCase());
    if (headings.length) {
      const generic = headings.filter((h) =>
        GENERIC_README_SECTIONS.some((sec) => h.includes(sec)),
      ).length;
      const coverage = generic / Math.max(1, headings.length);
      const sscore = clamp(0.48 + 0.3 * clamp((coverage - 0.5) / 0.5));
      if (coverage > 0.5 && headings.length >= 4) {
        signals.push(
          this.signal("formulaic_structure", sscore, {
            confidence: clamp(headings.length / 8),
            weight: 0.7,
            reason:
              `${percent0(coverage)} of headings match the canonical generated-README ` +
              `section set.`,
            evidence: [
              this.evidence(
                "formulaic_structure",
                "Section layout closely matches the boilerplate " +
                  "Features/Installation/Usage/Contributing/License template.",
                { severity: sscore, path: unit.path },
              ),
            ],
          }),
        );
      }
    }

    return signals;
  }
}
