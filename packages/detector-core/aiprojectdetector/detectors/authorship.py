"""Authorship-artifact heuristics: the 'too clean / too polished' tells.

Unlike the LLM-fingerprint detector (which keys on tutorial-style narration),
this detector targets *natural* AI code that lacks obvious tells. It is based on
an empirical comparison of real human modules (CPython stdlib + Flask) against
independent AI re-implementations of the same functionality:

  * Humans leave **maintenance artifacts** — TODO/FIXME/HACK, ``# noqa``,
    ``# type: ignore``, commented-out experiments. Natural AI output had
    essentially none.
  * Humans write **terse, fragmentary comments**; AI writes grammatically
    complete, capitalized, full-sentence comments. (Measured: ~0.15 well-formed
    comment ratio for humans vs ~0.50 for AI.)

These are still weak, probabilistic signals — a meticulous human who leaves no
TODOs and writes polished comments will look more AI-like here. That trade-off
is intentional and documented (see docs/limitations.md): catching "clean" AI
necessarily raises the false-positive rate on very tidy human code.
"""

from __future__ import annotations

import ast
import re

from ..ingestion.models import Scan
from ..models import Signal
from ..parsing.languages import strip_comments
from ..utils.text import clamp, mean
from .base import AnalysisUnit, Detector

_ARTIFACT_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b")
_PRAGMA_RE = re.compile(r"(noqa|type:\s*ignore|pylint:|mypy:|pragma|# *type:)")
_WELLFORMED_RE = re.compile(r"^[A-Z][^\n]{6,}[.!?]$")
_CODEISH_RE = re.compile(r"(=|\(|\)|\bdef\b|\bclass\b|\bimport\b|\breturn\b|\bself\.|\[|\])")


def _clean_comments(source: str, language: str) -> list[str]:
    _, comments = strip_comments(source, language)
    return [c.strip() for c in comments if c.strip()]


def _is_commented_code(text: str, language: str) -> bool:
    """Detect commented-out code (a human tell). Python uses ast; others regex."""
    if not _CODEISH_RE.search(text):
        return False
    if language == "python":
        for candidate in (text, text + " pass" if text.rstrip().endswith(":") else text):
            try:
                ast.parse(candidate)
                return True
            except SyntaxError:
                continue
        return False
    # Generic: a line ending in ; or { or } that also looks code-ish.
    return bool(re.search(r"[;{}]\s*$", text))


class AuthorshipArtifactsDetector(Detector):
    name = "authorship_artifacts"
    description = "Absence of human maintenance artifacts and unusually polished comments."

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:
        if unit.is_documentation or unit.loc < 12:
            return []
        comments = _clean_comments(unit.source, unit.language)
        if len(comments) < 4:
            return []
        wf = mean([1.0 if _WELLFORMED_RE.match(c) else 0.0 for c in comments])
        # Humans ~0.15, AI ~0.5+. Map two-sided around ~0.22.
        score = clamp(0.5 + 1.0 * (wf - 0.22))
        ev = []
        if score > 0.62:
            sample = next((c for c in comments if _WELLFORMED_RE.match(c)), None)
            ev.append(
                self.evidence(
                    "comment_polish",
                    f"{wf:.0%} of comments are polished full sentences (humans tend to "
                    f"write terse, fragmentary comments).",
                    severity=score,
                    path=unit.path,
                    start_line=unit.start_line,
                    snippet=sample,
                )
            )
        return [
            self.signal(
                "comment_polish",
                score,
                confidence=clamp(len(comments) / 8),
                weight=1.3,
                reason=f"{wf:.0%} of comments are complete, well-formed sentences.",
                evidence=ev,
            )
        ]

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:
        files = [f for f in scan.analyzable() if not f.is_documentation]
        total_loc = sum(f.loc for f in files)
        if total_loc < 40:
            return []
        full = "\n".join(f.source for f in files)
        kloc = max(0.3, total_loc / 1000)
        artifacts = (len(_ARTIFACT_RE.findall(full)) + len(_PRAGMA_RE.findall(full))) / kloc

        # Absence of any maintenance artifacts leans AI; presence leans human.
        score = clamp(0.585 - 0.5 * min(artifacts, 1.0))
        conf = clamp(total_loc / 600)
        ev = []
        if artifacts < 0.05 and total_loc > 150:
            ev.append(
                self.evidence(
                    "missing_human_artifacts",
                    f"No human maintenance artifacts (TODO/FIXME/noqa/commented-out code) "
                    f"found across {total_loc} lines; human codebases of this size usually "
                    f"contain some.",
                    severity=score,
                )
            )
        signals = [
            self.signal(
                "missing_human_artifacts",
                score,
                confidence=conf,
                weight=1.0,
                reason=f"{artifacts:.2f} maintenance artifacts per KLOC "
                f"(absence leans AI; presence leans human).",
                evidence=ev,
            )
        ]

        # Commented-out code is a (weak) human tell; total absence in a sizable
        # codebase nudges toward AI.
        comments = _clean_comments(full, "python" if scan.languages().get("python") else "javascript")
        if len(comments) >= 8:
            cc = mean([1.0 if _is_commented_code(c, "python") else 0.0 for c in comments])
            cscore = clamp(0.54 - 1.3 * cc)
            signals.append(
                self.signal(
                    "no_commented_out_code",
                    cscore,
                    confidence=clamp(len(comments) / 25),
                    weight=0.5,
                    reason=f"{cc:.0%} of comments are commented-out code "
                    f"(humans leave some; absence leans AI).",
                )
            )
        return signals
