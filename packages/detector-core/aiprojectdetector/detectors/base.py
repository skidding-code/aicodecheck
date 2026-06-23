"""Detector base classes and the unit abstraction they analyze.

A *detector* is a pluggable component that inspects code and emits ``Signal``
objects. Each signal is a single, explainable measurement on a 0..1 scale where
0.5 is "no information". Detectors never make final decisions; the ensemble
(aiprojectdetector.scoring.ensemble) combines their signals into a verdict.

Design goals:
  * Pure, deterministic, side-effect free -> trivially testable.
  * Self-describing: every signal carries a human-readable ``reason`` and
    concrete ``EvidenceItem`` objects.
  * Pluggable: third parties register new detectors without touching the core.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass

from ..ingestion.models import Scan, ScannedFile
from ..models import EvidenceItem, Signal


@dataclass
class AnalysisUnit:
    """A chunk of code to analyze: a whole file, or a function/class/snippet."""

    source: str
    language: str
    path: str
    kind: str = "file"  # file | function | method | class | snippet
    name: str = ""
    start_line: int | None = None
    end_line: int | None = None
    is_documentation: bool = False
    is_config: bool = False

    @property
    def loc(self) -> int:
        return self.source.count("\n") + 1 if self.source else 0


class Detector(abc.ABC):
    """Base class for all detectors.

    Subclasses override ``unit_signals`` (per file/function) and/or
    ``repo_signals`` (whole-scan, cross-file). Both default to empty so a
    detector only implements the scope it cares about.
    """

    name: str = "detector"
    description: str = ""
    # Multiplies the weight of every signal this detector emits. Lets the
    # ensemble dial a whole family of signals up or down from one place.
    weight: float = 1.0

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:  # noqa: ARG002
        return []

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:  # noqa: ARG002
        return []

    # -- helpers -----------------------------------------------------------
    def signal(
        self,
        name: str,
        score: float,
        *,
        confidence: float,
        reason: str,
        weight: float = 1.0,
        evidence: list[EvidenceItem] | None = None,
    ) -> Signal:
        return Signal(
            name=name,
            detector=self.name,
            score=max(0.0, min(1.0, score)),
            weight=weight * self.weight,
            confidence=max(0.0, min(1.0, confidence)),
            reason=reason,
            evidence=evidence or [],
        )

    def evidence(
        self,
        signal_name: str,
        message: str,
        *,
        severity: float = 0.5,
        path: str | None = None,
        start_line: int | None = None,
        end_line: int | None = None,
        snippet: str | None = None,
        **data,
    ) -> EvidenceItem:
        return EvidenceItem(
            detector=self.name,
            signal=signal_name,
            message=message,
            severity=max(0.0, min(1.0, severity)),
            path=path,
            start_line=start_line,
            end_line=end_line,
            snippet=snippet,
            data=data,
        )


def file_to_unit(f: ScannedFile) -> AnalysisUnit:
    return AnalysisUnit(
        source=f.source,
        language=f.language,
        path=f.rel_path,
        kind="file",
        name=f.rel_path,
        is_documentation=f.is_documentation,
        is_config=f.is_config,
    )
