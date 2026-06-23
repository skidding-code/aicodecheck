"""Repository-behavior heuristics: testing, contributors, branching, deps.

These are project-shape signals. They are *weak* and often point the other way
(a lone contributor or no tests is extremely common in legitimate human
projects), so they carry low weight and mostly add context rather than verdict.
"""

from __future__ import annotations

from ..ingestion.models import Scan
from ..models import Signal
from .base import AnalysisUnit, Detector


class RepoBehaviorDetector(Detector):
    name = "repo_behavior"
    description = "Contributor count, branching, test presence, dependency shape."

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:
        signals: list[Signal] = []

        # Single-contributor + single-branch + tag-less repos lean slightly
        # toward "generated then pushed", but this is genuinely weak.
        if scan.git_available:
            n_contrib = max(1, len(scan.contributors))
            n_branches = max(1, len(scan.branches))
            solo = n_contrib == 1 and n_branches <= 1
            score = 0.55 if solo else 0.48
            signals.append(
                self.signal(
                    "development_shape",
                    score,
                    confidence=0.3,
                    weight=0.4,
                    reason=f"{n_contrib} contributor(s), {n_branches} branch(es), "
                    f"{len(scan.tags)} tag(s).",
                )
            )

        # Test presence: total absence of tests in a non-trivial codebase is a
        # very mild signal (humans also skip tests, hence low weight).
        analyzable = scan.analyzable()
        if len(analyzable) >= 8:
            has_tests = any(f.is_test for f in scan.files)
            score = 0.46 if has_tests else 0.53
            signals.append(
                self.signal(
                    "testing_patterns",
                    score,
                    confidence=0.3,
                    weight=0.3,
                    reason="Test files present." if has_tests else "No test files detected.",
                )
            )

        return signals
