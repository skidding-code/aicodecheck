"""Commit-history heuristics.

Large one-shot "code dumps", generic commit messages, and missing iterative
development are weak-but-real indicators that code arrived fully-formed rather
than evolving. Requires git history; emits nothing when unavailable.
"""

from __future__ import annotations

from ..constants import GENERIC_COMMIT_MESSAGES
from ..ingestion.models import Scan
from ..models import Signal
from ..utils.text import clamp
from .base import AnalysisUnit, Detector


class CommitHistoryDetector(Detector):
    name = "commit_history"
    description = "One-shot dumps, generic messages, non-iterative development timelines."

    def repo_signals(self, scan: Scan, units: list[AnalysisUnit]) -> list[Signal]:
        commits = scan.commits
        if not scan.git_available or not commits:
            return []
        signals: list[Signal] = []
        total = len(commits)

        # 1) Massive one-shot commits.
        insertions = [c.insertions for c in commits]
        total_ins = sum(insertions) or 1
        max_ins = max(insertions)
        biggest_share = max_ins / total_ins
        # Single dominant commit holding most of the code.
        score = clamp(0.45 + 0.5 * clamp((biggest_share - 0.4) / 0.55))
        ev = []
        if biggest_share > 0.5:
            big = max(commits, key=lambda c: c.insertions)
            ev.append(
                self.evidence(
                    "one_shot_commits",
                    f"A single commit ({big.sha[:8]}, '{big.message[:50]}') added "
                    f"{big.insertions} lines — {biggest_share:.0%} of all insertions, "
                    f"suggesting a large code dump rather than iterative development.",
                    severity=score,
                )
            )
        signals.append(
            self.signal(
                "one_shot_commits",
                score,
                confidence=clamp(total / 8),
                weight=1.2,
                reason=f"Largest commit holds {biggest_share:.0%} of insertions over {total} commits.",
                evidence=ev,
            )
        )

        # 2) Generic commit messages.
        generic = sum(
            1 for c in commits if c.message.strip().lower() in GENERIC_COMMIT_MESSAGES
        )
        gratio = generic / total
        gscore = clamp(0.48 + 0.35 * clamp(gratio / 0.5))
        if generic:
            signals.append(
                self.signal(
                    "generic_commit_messages",
                    gscore,
                    confidence=clamp(total / 10),
                    weight=0.8,
                    reason=f"{gratio:.0%} of commit messages are generic (e.g. 'update', 'fix').",
                    evidence=[
                        self.evidence(
                            "generic_commit_messages",
                            f"{generic} of {total} commit messages are generic boilerplate.",
                            severity=gscore,
                        )
                    ]
                    if gratio > 0.3
                    else [],
                )
            )

        # 3) Lack of iterative development (very few commits for lots of code).
        loc = scan.total_loc()
        if loc > 400:
            loc_per_commit = loc / total
            score = clamp(0.45 + 0.4 * clamp((loc_per_commit - 300) / 1200))
            if loc_per_commit > 400:
                signals.append(
                    self.signal(
                        "non_iterative_development",
                        score,
                        confidence=clamp(total / 6),
                        weight=0.9,
                        reason=f"~{loc_per_commit:.0f} lines per commit across {total} commits "
                        f"(little iterative refinement).",
                        evidence=[
                            self.evidence(
                                "non_iterative_development",
                                f"Repository has ~{loc:.0f} analyzed lines in only {total} "
                                f"commit(s) — limited iterative history.",
                                severity=score,
                            )
                        ],
                    )
                )

        # 4) Suspicious timeline: long inactivity followed by a large dump.
        timeline_signal = self._timeline_signal(scan)
        if timeline_signal:
            signals.append(timeline_signal)

        return signals

    def _timeline_signal(self, scan: Scan) -> Signal | None:
        dated = [c for c in scan.commits if c.timestamp]
        if len(dated) < 4:
            return None
        dated.sort(key=lambda c: c.timestamp)  # type: ignore[arg-type]
        gaps_then_dump = 0
        for prev, cur in zip(dated, dated[1:], strict=False):
            gap_days = (cur.timestamp - prev.timestamp).total_seconds() / 86400  # type: ignore[operator]
            if gap_days > 30 and cur.insertions > 500:
                gaps_then_dump += 1
        if gaps_then_dump == 0:
            return None
        score = clamp(0.5 + 0.3 * clamp(gaps_then_dump / 3))
        return self.signal(
            "suspicious_timeline",
            score,
            confidence=clamp(len(dated) / 12),
            weight=0.7,
            reason=f"{gaps_then_dump} large commit(s) followed long inactivity gaps.",
        )
