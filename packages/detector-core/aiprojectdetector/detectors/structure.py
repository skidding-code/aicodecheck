"""Code-structure heuristics: repetition, uniformity, boilerplate, symmetry.

AI-generated codebases frequently exhibit *unusual regularity*: functions of
near-identical length, files of near-identical size, and large amounts of
duplicated boilerplate. Human codebases tend to be lumpier. None of these is
conclusive alone, which is exactly why they are weighted signals.
"""

from __future__ import annotations

from collections import Counter

from ..ingestion.models import Scan
from ..models import Signal
from ..utils.text import (
    clamp,
    coefficient_of_variation,
    compressibility,
    ngram_repetition,
    tokenize,
)
from .base import AnalysisUnit, Detector


class StructureDetector(Detector):
    name = "structure"
    description = "Repetition, uniformity, boilerplate and structural symmetry."

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:
        if unit.is_documentation or unit.loc < 8:
            return []
        tokens = tokenize(unit.source)
        if len(tokens) < 30:
            return []

        rep = ngram_repetition(tokens, n=4)
        comp = compressibility(unit.source)
        # High repetition (rep up) and high compressibility (comp down) lean AI.
        rep_component = clamp(rep / 0.35)  # rep>=0.35 saturates
        comp_component = clamp((0.55 - comp) / 0.45)  # comp<=0.10 saturates
        raw = 0.5 + 0.35 * (0.6 * rep_component + 0.4 * comp_component - 0.25)
        score = clamp(raw)
        confidence = clamp(len(tokens) / 600)

        ev = []
        if score > 0.58:
            ev.append(
                self.evidence(
                    "repetitive_patterns",
                    f"Repetitive token structure (4-gram repetition {rep:.0%}, "
                    f"compresses to {comp:.0%} of size).",
                    severity=score,
                    path=unit.path,
                    start_line=unit.start_line,
                    end_line=unit.end_line,
                )
            )
        return [
            self.signal(
                "repetitive_patterns",
                score,
                confidence=confidence,
                weight=1.0,
                reason=(
                    f"4-gram repetition {rep:.0%}; compressibility {comp:.0%}."
                ),
                evidence=ev,
            )
        ]

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:
        signals: list[Signal] = []
        func_units = [u for u in units if u.kind in {"function", "method"} and u.loc > 1]
        file_units = [u for u in units if u.kind == "file" and not u.is_documentation]

        # 1) Uniform function lengths.
        if len(func_units) >= 8:
            lengths = [u.loc for u in func_units]
            cv = coefficient_of_variation(lengths)
            uniformity = clamp(1 - cv / 0.7)
            score = clamp(0.4 + 0.45 * uniformity)
            ev = []
            if uniformity > 0.6:
                ev.append(
                    self.evidence(
                        "uniform_function_lengths",
                        f"Function lengths are unusually uniform across "
                        f"{len(func_units)} functions (coefficient of variation "
                        f"{cv:.2f}; lower is more uniform).",
                        severity=score,
                    )
                )
            signals.append(
                self.signal(
                    "uniform_function_lengths",
                    score,
                    confidence=clamp(len(func_units) / 40),
                    weight=1.2,
                    reason=f"Function-length CV={cv:.2f} over {len(func_units)} functions.",
                    evidence=ev,
                )
            )

        # 2) Uniform file sizes.
        if len(file_units) >= 6:
            sizes = [u.loc for u in file_units]
            cv = coefficient_of_variation(sizes)
            uniformity = clamp(1 - cv / 0.9)
            score = clamp(0.43 + 0.35 * uniformity)
            signals.append(
                self.signal(
                    "uniform_file_sizes",
                    score,
                    confidence=clamp(len(file_units) / 30),
                    weight=0.7,
                    reason=f"File-size CV={cv:.2f} over {len(file_units)} files.",
                )
            )

        # 3) Cross-file boilerplate / duplicated lines.
        dup = self._duplicate_line_ratio(file_units)
        if dup is not None:
            # Require duplication well above the natural baseline before leaning
            # AI; human test suites and configs legitimately repeat lines.
            score = clamp(0.48 + 0.42 * clamp((dup - 0.12) / 0.33))
            ev = []
            if dup > 0.22:
                ev.append(
                    self.evidence(
                        "repeated_boilerplate",
                        f"{dup:.0%} of non-trivial lines are duplicated across files, "
                        f"suggesting templated/boilerplate reuse.",
                        severity=score,
                    )
                )
            signals.append(
                self.signal(
                    "repeated_boilerplate",
                    score,
                    confidence=clamp(len(file_units) / 20) * 0.85,
                    weight=0.8,
                    reason=f"Cross-file duplicated-line ratio {dup:.0%}.",
                    evidence=ev,
                )
            )

        return signals

    @staticmethod
    def _duplicate_line_ratio(file_units: list[AnalysisUnit]) -> float | None:
        counter: Counter[str] = Counter()
        total = 0
        for u in file_units:
            for line in u.source.split("\n"):
                norm = line.strip()
                # Ignore trivial/structural lines that are duplicated for syntax reasons.
                if len(norm) < 12 or norm in {"});", "})", "return;"}:
                    continue
                counter[norm] += 1
                total += 1
        if total < 40:
            return None
        duplicated = sum(c - 1 for c in counter.values() if c > 1)
        return duplicated / total
