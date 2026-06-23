"""Stylometric heuristics: naming, formatting, descriptiveness, vocabulary.

CAVEAT (documented on purpose): many style features are confounded by
auto-formatters (black, prettier, gofmt) and linters. A perfectly consistent
style is weak evidence at best. These signals therefore carry modest weights
and their reasons name the confound explicitly.
"""

from __future__ import annotations

from collections import Counter

from ..ingestion.models import Scan
from ..models import Signal
from ..utils.text import (
    clamp,
    identifiers,
    mean,
    naming_convention,
    split_identifier,
    stdev,
    type_token_ratio,
)
from .base import AnalysisUnit, Detector

_ROUND_WIDTHS = (79, 80, 88, 99, 100, 120)


class StylometryDetector(Detector):
    name = "stylometry"
    description = "Naming conventions, formatting regularity, identifier descriptiveness."

    def unit_signals(self, unit: AnalysisUnit) -> list[Signal]:
        if unit.is_documentation or unit.loc < 6:
            return []
        idents = identifiers(unit.source)
        signals: list[Signal] = []

        # 1) Identifier descriptiveness: LLMs favor verbose, multi-word names.
        if len(idents) >= 12:
            word_counts = [len(split_identifier(i)) for i in idents]
            char_lens = [len(i) for i in idents]
            avg_words = mean(word_counts)
            avg_len = mean(char_lens)
            # 2.2 words / 13 chars average is high for hand-written code.
            descriptiveness = clamp((avg_words - 1.3) / 1.4) * 0.6 + clamp((avg_len - 6) / 10) * 0.4
            score = clamp(0.45 + 0.4 * descriptiveness)
            ev = []
            if descriptiveness > 0.6:
                longest = sorted(set(idents), key=len, reverse=True)[:5]
                ev.append(
                    self.evidence(
                        "descriptive_naming",
                        f"Identifiers are unusually descriptive (avg {avg_words:.1f} words / "
                        f"{avg_len:.0f} chars). Examples: {', '.join(longest)}.",
                        severity=score,
                        path=unit.path,
                        start_line=unit.start_line,
                    )
                )
            signals.append(
                self.signal(
                    "descriptive_naming",
                    score,
                    confidence=clamp(len(idents) / 80),
                    weight=0.9,
                    reason=f"Avg identifier {avg_words:.1f} words / {avg_len:.0f} chars.",
                    evidence=ev,
                )
            )

        # 2) Naming-convention consistency (confounded by linters -> low weight).
        if len(idents) >= 15:
            conventions = Counter(naming_convention(i) for i in idents)
            conventions.pop("other", None)
            if conventions:
                dominant = conventions.most_common(1)[0][1]
                consistency = dominant / sum(conventions.values())
                score = clamp(0.47 + 0.25 * clamp((consistency - 0.7) / 0.3))
                signals.append(
                    self.signal(
                        "naming_consistency",
                        score,
                        confidence=clamp(len(idents) / 120) * 0.7,
                        weight=0.4,
                        reason=f"{consistency:.0%} of identifiers share one convention "
                        f"(note: also explained by linters).",
                    )
                )

        # 3) Formatting regularity: line lengths clustered and near round widths.
        signals.extend(self._formatting_signal(unit))

        # 4) Vocabulary richness (type-token ratio); very low -> templated.
        toks = identifiers(unit.source)
        if len(toks) >= 40:
            ttr = type_token_ratio(toks)
            score = clamp(0.5 + 0.3 * clamp((0.45 - ttr) / 0.35))
            signals.append(
                self.signal(
                    "vocabulary_richness",
                    score,
                    confidence=clamp(len(toks) / 200),
                    weight=0.5,
                    reason=f"Identifier type-token ratio {ttr:.2f} (lower is more repetitive).",
                )
            )

        return signals

    def _formatting_signal(self, unit: AnalysisUnit) -> list[Signal]:
        lines = [ln for ln in unit.source.split("\n") if ln.strip()]
        if len(lines) < 10:
            return []
        lengths = [len(ln) for ln in lines]
        sd = stdev(lengths)
        m = mean(lengths)
        # Low variance of line length is a mild regularity signal.
        regularity = clamp(1 - (sd / (m + 1e-9)) / 0.7)
        # Bonus if many lines hug a known max-width.
        near_round = sum(
            1 for ln_len in lengths if any(abs(ln_len - w) <= 1 for w in _ROUND_WIDTHS)
        ) / len(lengths)
        score = clamp(0.46 + 0.25 * regularity + 0.2 * clamp(near_round / 0.15))
        return [
            self.signal(
                "formatting_regularity",
                score,
                confidence=clamp(len(lines) / 80) * 0.7,
                weight=0.4,
                reason=f"Line-length stdev {sd:.0f}; {near_round:.0%} of lines near a round width "
                f"(note: also explained by auto-formatters).",
            )
        ]

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:
        file_units = [u for u in units if u.kind == "file" and not u.is_documentation and u.loc > 8]
        if len(file_units) < 6:
            return []
        # Cross-file uniformity of mean line length: very uniform style across
        # many files can indicate single-pass generation.
        per_file_mean = []
        for u in file_units:
            ls = [len(x) for x in u.source.split("\n") if x.strip()]
            if ls:
                per_file_mean.append(mean(ls))
        if len(per_file_mean) < 6:
            return []
        cv = stdev(per_file_mean) / (mean(per_file_mean) + 1e-9)
        uniformity = clamp(1 - cv / 0.5)
        score = clamp(0.47 + 0.25 * uniformity)
        return [
            self.signal(
                "cross_file_style_uniformity",
                score,
                confidence=clamp(len(file_units) / 40) * 0.8,
                weight=0.6,
                reason=f"Per-file mean line length CV={cv:.2f} across {len(file_units)} files.",
            )
        ]
