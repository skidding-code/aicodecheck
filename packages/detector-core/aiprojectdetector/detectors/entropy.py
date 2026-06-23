"""Entropy and complexity-regularity heuristics.

Two ideas:
  * Token entropy: generated code is often slightly more predictable (lower
    normalized entropy) than organically-grown code.
  * Complexity regularity: AI tends to produce functions of similar cyclomatic
    complexity, whereas human code has a few hot, gnarly functions and many
    trivial ones (a heavier tail).
"""

from __future__ import annotations

import re

from ..ingestion.models import Scan
from ..models import Signal
from ..utils.text import clamp, coefficient_of_variation, normalized_entropy, tokenize
from .base import AnalysisUnit, Detector

# Branch-introducing tokens used for an approximate cyclomatic complexity.
_BRANCH_RE = re.compile(
    r"\b(if|elif|else if|for|while|case|when|catch|except|&&|\|\||\?)\b|\?\s*[^:]+:"
)


def approx_cyclomatic(source: str) -> int:
    return 1 + len(_BRANCH_RE.findall(source))


class EntropyDetector(Detector):
    name = "entropy"
    description = "Token entropy and complexity-distribution regularity."

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:
        if unit.is_documentation or unit.loc < 10:
            return []
        tokens = tokenize(unit.source)
        if len(tokens) < 40:
            return []
        ent = normalized_entropy(tokens)
        # Two-sided around a human-typical center: low entropy leans AI, high
        # entropy leans human. One-sided mappings would bias every file upward.
        score = clamp(0.5 + 0.6 * (0.78 - ent))
        return [
            self.signal(
                "code_entropy",
                score,
                confidence=clamp(len(tokens) / 300),
                weight=0.7,
                reason=f"Normalized token entropy {ent:.2f} (lower is more predictable).",
            )
        ]

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:
        func_units = [u for u in units if u.kind in {"function", "method"} and u.loc >= 3]
        if len(func_units) < 10:
            return []
        complexities = [approx_cyclomatic(u.source) for u in func_units]
        cv = coefficient_of_variation(complexities)
        # Low CV => suspiciously uniform complexity.
        uniformity = clamp(1 - cv / 0.9)
        score = clamp(0.44 + 0.4 * uniformity)
        ev = []
        if uniformity > 0.6:
            ev.append(
                self.evidence(
                    "predictable_complexity",
                    f"Cyclomatic complexity is unusually uniform across "
                    f"{len(func_units)} functions (CV {cv:.2f}); human code usually has a "
                    f"heavier tail of complex functions.",
                    severity=score,
                )
            )
        return [
            self.signal(
                "predictable_complexity",
                score,
                confidence=clamp(len(func_units) / 50),
                weight=0.9,
                reason=f"Complexity CV={cv:.2f} across {len(func_units)} functions.",
                evidence=ev,
            )
        ]
