"""Documentation / README heuristics.

Generated READMEs tend to be glossy and formulaic: marketing adjectives,
dense bullet lists, emoji-decorated headings, and the same canonical section
layout (Features / Installation / Usage / Contributing / License).
"""

from __future__ import annotations

import re

from ..constants import GENERIC_README_SECTIONS, LLM_DOC_PHRASES
from ..models import Signal
from ..utils.text import clamp
from .base import AnalysisUnit, Detector
from .llm_fingerprint import _EMOJI_RE

_HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$", re.MULTILINE)
_BULLET_RE = re.compile(r"^\s*([-*+]|\d+\.)\s+", re.MULTILINE)


class DocumentationDetector(Detector):
    name = "documentation"
    description = "README/Markdown phrasing, bullet/emoji density, formulaic structure."

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:
        if not unit.is_documentation or unit.loc < 6:
            return []
        text = unit.source
        low = text.lower()
        lines = [ln for ln in text.split("\n") if ln.strip()]
        if len(lines) < 6:
            return []
        signals: list[Signal] = []

        # 1) Marketing / chatbot phrasing.
        hits = [p for p in LLM_DOC_PHRASES if p in low]
        phrase_score = clamp(0.5 + 0.4 * clamp(len(hits) / 6))
        ev = []
        if hits:
            ev.append(
                self.evidence(
                    "chatbot_wording",
                    f"Documentation uses {len(hits)} marketing/LLM-typical phrase(s): "
                    f"{', '.join(repr(h) for h in hits[:5])}.",
                    severity=phrase_score,
                    path=unit.path,
                )
            )
        signals.append(
            self.signal(
                "chatbot_wording",
                phrase_score,
                confidence=clamp(len(lines) / 40),
                weight=1.1,
                reason=f"{len(hits)} marketing/LLM-typical doc phrase(s).",
                evidence=ev,
            )
        )

        # 2) Bullet density.
        bullets = len(_BULLET_RE.findall(text))
        bullet_ratio = bullets / max(1, len(lines))
        bscore = clamp(0.5 + 0.3 * clamp((bullet_ratio - 0.3) / 0.4))
        if bullet_ratio > 0.3:
            signals.append(
                self.signal(
                    "excessive_bullets",
                    bscore,
                    confidence=clamp(len(lines) / 40),
                    weight=0.6,
                    reason=f"{bullet_ratio:.0%} of lines are bullet points.",
                )
            )

        # 3) Emoji density.
        emoji = _EMOJI_RE.findall(text)
        if emoji:
            escore = clamp(0.5 + 0.3 * clamp(len(emoji) / 8))
            signals.append(
                self.signal(
                    "excessive_emoji",
                    escore,
                    confidence=0.5,
                    weight=0.6,
                    reason=f"{len(emoji)} emoji in documentation.",
                    evidence=[
                        self.evidence(
                            "excessive_emoji",
                            f"{len(emoji)} emoji used in documentation/headings.",
                            severity=escore,
                            path=unit.path,
                        )
                    ]
                    if len(emoji) >= 4
                    else [],
                )
            )

        # 4) Formulaic section layout.
        headings = [h.strip().lower() for h in _HEADING_RE.findall(text)]
        if headings:
            generic = sum(
                1 for h in headings if any(sec in h for sec in GENERIC_README_SECTIONS)
            )
            coverage = generic / max(1, len(headings))
            sscore = clamp(0.48 + 0.3 * clamp((coverage - 0.5) / 0.5))
            if coverage > 0.5 and len(headings) >= 4:
                signals.append(
                    self.signal(
                        "formulaic_structure",
                        sscore,
                        confidence=clamp(len(headings) / 8),
                        weight=0.7,
                        reason=f"{coverage:.0%} of headings match the canonical generated-README "
                        f"section set.",
                        evidence=[
                            self.evidence(
                                "formulaic_structure",
                                "Section layout closely matches the boilerplate "
                                "Features/Installation/Usage/Contributing/License template.",
                                severity=sscore,
                                path=unit.path,
                            )
                        ],
                    )
                )

        return signals
