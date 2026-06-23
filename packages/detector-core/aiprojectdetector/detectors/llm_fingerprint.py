"""LLM fingerprint heuristics: tell-tale comments, placeholders, over-docs.

These are the signals most specific to *generated* code as opposed to merely
clean code: tutorial-style narration in comments, placeholder stubs, generic
TODOs, emoji in source comments, and comment-to-code ratios far above what
working engineers typically write.
"""

from __future__ import annotations

import re

from ..constants import LLM_COMMENT_PHRASES, PLACEHOLDER_MARKERS
from ..models import Signal
from ..parsing.languages import strip_comments
from ..utils.text import clamp
from .base import AnalysisUnit, Detector

_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF✀-➿]"
)
_TODO_RE = re.compile(r"\b(todo|fixme|xxx|hack)\b", re.IGNORECASE)


class LLMFingerprintDetector(Detector):
    name = "llm_fingerprint"
    description = "Tell-tale LLM phrasings, placeholders, generic TODOs, over-documentation."

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:
        if unit.is_config or unit.loc < 5:
            return []
        code, comments = strip_comments(unit.source, unit.language)
        comment_text = "\n".join(comments).lower()
        comment_lines = [c for c in comments if c.strip()]
        code_lines = [ln for ln in code.split("\n") if ln.strip()]
        signals: list[Signal] = []

        # 1) Generic / tutorial-style comments.
        if comment_lines:
            hits = [p for p in LLM_COMMENT_PHRASES if p in comment_text]
            density = len(hits) / max(1, len(comment_lines))
            score = clamp(0.5 + 0.45 * clamp(density / 0.4) + 0.1 * clamp(len(hits) / 6))
            ev = []
            if hits:
                sample = self._first_comment_with(comments, hits)
                ev.append(
                    self.evidence(
                        "generic_comments",
                        f"Comments use {len(hits)} phrasing(s) common in LLM output "
                        f"(e.g. {', '.join(repr(h) for h in hits[:4])}).",
                        severity=score,
                        path=unit.path,
                        start_line=unit.start_line,
                        snippet=sample,
                    )
                )
            signals.append(
                self.signal(
                    "generic_comments",
                    score,
                    confidence=clamp(len(comment_lines) / 15),
                    weight=1.3,
                    reason=f"{len(hits)} LLM-typical comment phrase(s) over "
                    f"{len(comment_lines)} comment line(s).",
                    evidence=ev,
                )
            )

        # 2) Placeholder / stub implementations.
        lower_all = unit.source.lower()
        ph_hits = [m for m in PLACEHOLDER_MARKERS if m in lower_all]
        if ph_hits:
            score = clamp(0.55 + 0.4 * clamp(len(ph_hits) / 4))
            signals.append(
                self.signal(
                    "placeholder_implementations",
                    score,
                    confidence=0.55,
                    weight=1.1,
                    reason=f"Found placeholder/stub markers: {', '.join(repr(h) for h in ph_hits[:4])}.",
                    evidence=[
                        self.evidence(
                            "placeholder_implementations",
                            f"Placeholder/stub text present ({', '.join(ph_hits[:3])}).",
                            severity=score,
                            path=unit.path,
                            start_line=unit.start_line,
                        )
                    ],
                )
            )

        # 3) Over-documentation: comment-to-code ratio far above typical.
        if len(code_lines) >= 10:
            ratio = len(comment_lines) / max(1, len(code_lines))
            score = clamp(0.5 + 0.4 * clamp((ratio - 0.35) / 0.6))
            if ratio > 0.45:
                signals.append(
                    self.signal(
                        "excessive_documentation",
                        score,
                        confidence=clamp(len(code_lines) / 60),
                        weight=0.8,
                        reason=f"Comment-to-code ratio {ratio:.0%} (high).",
                        evidence=[
                            self.evidence(
                                "excessive_documentation",
                                f"Unusually high comment-to-code ratio ({ratio:.0%}).",
                                severity=score,
                                path=unit.path,
                            )
                        ],
                    )
                )

        # 4) Emoji in source comments.
        emoji = _EMOJI_RE.findall(comment_text)
        if emoji:
            score = clamp(0.55 + 0.3 * clamp(len(emoji) / 4))
            signals.append(
                self.signal(
                    "emoji_in_comments",
                    score,
                    confidence=0.5,
                    weight=0.6,
                    reason=f"{len(emoji)} emoji found in code comments.",
                )
            )

        # 5) Generic TODOs without specifics.
        todos = _TODO_RE.findall(comment_text)
        if todos:
            generic = sum(1 for c in comments if _TODO_RE.search(c) and len(c.strip()) < 24)
            if generic:
                score = clamp(0.5 + 0.25 * clamp(generic / 4))
                signals.append(
                    self.signal(
                        "generic_todos",
                        score,
                        confidence=0.45,
                        weight=0.5,
                        reason=f"{generic} short/generic TODO-style comment(s).",
                    )
                )

        return signals

    @staticmethod
    def _first_comment_with(comments: list[str], phrases: list[str]) -> str | None:
        for c in comments:
            low = c.lower()
            if any(p in low for p in phrases):
                return c.strip()[:200]
        return None
