"""The analysis engine: orchestrates ingestion output -> structured result.

This is the single entry point most callers use::

    from aiprojectdetector import Engine
    from aiprojectdetector.ingestion import load_folder

    scan = load_folder("/path/to/repo")
    result = Engine().analyze(scan)
    print(result.classification, result.overall_ai_probability)
"""

from __future__ import annotations

import math
import time
import uuid
from collections import defaultdict

from .detectors import AnalysisUnit, Detector, default_detectors, file_to_unit
from .detectors.attribution import estimate_attribution
from .ingestion.models import Scan
from .models import (
    AIScore,
    AnalysisResult,
    AnalysisTarget,
    CommitAnalysis,
    ContributorAnalysis,
    EntityAnalysis,
    EntityLevel,
    EvidenceItem,
    Signal,
)
from .parsing.entities import extract_entities
from .reporting import build_recommendations, build_visualizations
from .scoring.calibration import DEFAULT_PROFILE, CalibrationProfile
from .scoring.ensemble import combine_signals

ENGINE_VERSION = "0.1.0"


class Engine:
    """Runs the configured detectors over a Scan and produces an AnalysisResult."""

    def __init__(
        self,
        detectors: list[Detector] | None = None,
        profile: CalibrationProfile | None = None,
        *,
        max_functions: int = 4000,
        max_files_detailed: int = 5000,
    ) -> None:
        self.detectors = detectors if detectors is not None else default_detectors()
        self.profile = profile or DEFAULT_PROFILE
        self.max_functions = max_functions
        self.max_files_detailed = max_files_detailed

    # ------------------------------------------------------------------ #
    def analyze(self, scan: Scan, analysis_id: str | None = None) -> AnalysisResult:
        start = time.time()
        analysis_id = analysis_id or uuid.uuid4().hex

        analyzable = scan.analyzable()[: self.max_files_detailed]
        file_units = [file_to_unit(f) for f in analyzable]

        file_entities, file_signal_map = self._analyze_files(analyzable, file_units)
        function_entities, function_units = self._analyze_functions(analyzable)

        all_units = file_units + function_units
        repo_signals = self._repo_signals(scan, all_units)

        overall = self._overall_score(file_entities, repo_signals, file_signal_map)
        folders = self._analyze_folders(file_entities)

        commit_analysis = self._commit_analysis(scan, repo_signals)
        contributor_analysis = self._contributor_analysis(scan)
        attribution = estimate_attribution(scan, overall.ai_probability)

        signal_means = self._signal_means(file_signal_map, repo_signals)
        # For multi-file inputs, summarize the actual detector signals driving
        # the verdict instead of the opaque per-file aggregate reasons.
        if len(file_entities) > 3:
            overall.reasons = self._summary_reasons(signal_means, repo_signals)
        evidence = self._collect_evidence(file_signal_map, repo_signals)
        viz = build_visualizations(scan, file_entities, folders, overall, signal_means)
        recommendations = build_recommendations(overall, scan, file_entities)

        target = AnalysisTarget(
            kind=scan.kind,
            name=scan.name,
            source=scan.source,
            owner=scan.owner,
            repo=scan.repo,
            ref=scan.ref,
            languages=scan.languages(),
            total_files=len(scan.files),
            analyzed_files=len(analyzable),
            skipped_files=scan.skipped_files,
            total_loc=scan.total_loc(),
            bytes_scanned=scan.bytes_scanned,
        )

        return AnalysisResult(
            id=analysis_id,
            target=target,
            overall_ai_probability=overall.ai_probability,
            human_probability=overall.human_probability,
            classification=overall.classification,
            confidence=overall.confidence,
            score=overall,
            files=file_entities,
            folders=folders,
            functions=function_entities,
            snippets=[],
            commit_analysis=commit_analysis,
            contributor_analysis=contributor_analysis,
            attribution=attribution,
            reasons=overall.reasons,
            evidence=evidence,
            visualizations=viz,
            recommendations=recommendations,
            warnings=list(scan.warnings),
            elapsed_seconds=round(time.time() - start, 3),
            engine_version=ENGINE_VERSION,
        )

    # ------------------------------------------------------------------ #
    def _analyze_files(self, analyzable, file_units):
        entities: list[EntityAnalysis] = []
        signal_map: dict[str, list[Signal]] = {}
        for f, unit in zip(analyzable, file_units, strict=False):
            signals: list[Signal] = []
            for det in self.detectors:
                signals.extend(det.unit_signals(unit))
            score = combine_signals(signals, self.profile)
            signal_map[f.rel_path] = signals
            entities.append(
                EntityAnalysis(
                    level=EntityLevel.file,
                    identifier=f.rel_path,
                    name=f.rel_path,
                    language=f.language,
                    path=f.rel_path,
                    loc=f.loc,
                    score=score,
                    signals=signals,
                )
            )
        entities.sort(key=lambda e: e.score.risk_score, reverse=True)
        return entities, signal_map

    def _analyze_functions(self, analyzable):
        entities: list[EntityAnalysis] = []
        units: list[AnalysisUnit] = []
        for f in analyzable:
            if f.is_documentation or f.is_config:
                continue
            for ent in extract_entities(f.source, f.language):
                unit = AnalysisUnit(
                    source=ent.source,
                    language=f.language,
                    path=f.rel_path,
                    kind=ent.kind,
                    name=ent.name,
                    start_line=ent.start_line,
                    end_line=ent.end_line,
                )
                units.append(unit)
                if len(entities) >= self.max_functions:
                    continue
                signals: list[Signal] = []
                for det in self.detectors:
                    signals.extend(det.unit_signals(unit))
                if not signals:
                    continue
                level = EntityLevel.klass if ent.kind == "class" else (
                    EntityLevel.method if ent.kind == "method" else EntityLevel.function
                )
                entities.append(
                    EntityAnalysis(
                        level=level,
                        identifier=f"{f.rel_path}::{ent.name}",
                        name=ent.name,
                        language=f.language,
                        path=f.rel_path,
                        start_line=ent.start_line,
                        end_line=ent.end_line,
                        loc=ent.loc,
                        score=combine_signals(signals, self.profile),
                        signals=signals,
                        parent=ent.parent,
                    )
                )
        entities.sort(key=lambda e: e.score.risk_score, reverse=True)
        return entities, units

    def _repo_signals(self, scan: Scan, all_units: list[AnalysisUnit]) -> list[Signal]:
        signals: list[Signal] = []
        for det in self.detectors:
            signals.extend(det.repo_signals(scan, all_units))
        return signals

    def _overall_score(
        self,
        file_entities: list[EntityAnalysis],
        repo_signals: list[Signal],
        file_signal_map: dict[str, list[Signal]],
    ) -> AIScore:
        # For small inputs (a snippet or a handful of files) we pool the raw
        # per-file signals so the overall reasons are concrete and actionable.
        if len(file_entities) <= 3:
            raw = [s for sigs in file_signal_map.values() for s in sigs]
            return combine_signals(repo_signals + raw, self.profile, max_reasons=8)

        # For larger inputs, each file contributes one synthetic signal weighted
        # by log(size) so a single large file cannot dominate purely by having
        # many sub-signals.
        synthetic: list[Signal] = []
        for fe in file_entities:
            if fe.score.confidence <= 0:
                continue
            synthetic.append(
                Signal(
                    name=f"file::{fe.path}",
                    detector="aggregate",
                    score=fe.score.ai_probability,
                    weight=math.log2(fe.loc + 2),
                    confidence=fe.score.confidence,
                    reason=f"Aggregated file score for {fe.path}.",
                )
            )
        return combine_signals(repo_signals + synthetic, self.profile, max_reasons=8)

    def _analyze_folders(self, file_entities: list[EntityAnalysis]) -> list[EntityAnalysis]:
        groups: dict[str, list[EntityAnalysis]] = defaultdict(list)
        for fe in file_entities:
            folder = "/".join((fe.path or "").split("/")[:-1]) or "."
            # attribute to every ancestor folder for a hierarchical heatmap
            parts = folder.split("/")
            for i in range(len(parts)):
                groups["/".join(parts[: i + 1])].append(fe)

        folders: list[EntityAnalysis] = []
        for path, members in groups.items():
            if path == "":
                continue
            synth = [
                Signal(
                    name=f"file::{m.path}",
                    detector="aggregate",
                    score=m.score.ai_probability,
                    weight=math.log2(m.loc + 2),
                    confidence=m.score.confidence,
                )
                for m in members
                if m.score.confidence > 0
            ]
            score = combine_signals(synth, self.profile)
            score.reasons = [f"{len(members)} files aggregated under this folder."]
            folders.append(
                EntityAnalysis(
                    level=EntityLevel.folder,
                    identifier=path,
                    name=path,
                    path=path,
                    loc=sum(m.loc for m in members),
                    score=score,
                )
            )
        folders.sort(key=lambda e: e.score.risk_score, reverse=True)
        return folders

    def _commit_analysis(self, scan: Scan, repo_signals: list[Signal]) -> CommitAnalysis:
        commit_signals = [s for s in repo_signals if s.detector == "commit_history"]
        score = combine_signals(commit_signals, self.profile) if commit_signals else AIScore()
        return CommitAnalysis(
            available=scan.git_available,
            total_commits=len(scan.commits),
            total_authors=len(scan.contributors),
            score=score,
            signals=commit_signals,
            timeline=scan.commits[:500],
            reasons=score.reasons,
        )

    def _contributor_analysis(self, scan: Scan) -> ContributorAnalysis:
        return ContributorAnalysis(
            available=scan.git_available,
            contributors=scan.contributors,
            reasons=(
                [f"{len(scan.contributors)} contributor(s) detected."]
                if scan.git_available
                else ["No git history available; contributor analysis skipped."]
            ),
        )

    def _summary_reasons(
        self, signal_means: dict[str, dict[str, float]], repo_signals: list[Signal], limit: int = 8
    ) -> list[str]:
        """Human-readable summary of the signals that most moved the verdict.

        Ranks aggregated signals by deviation-from-neutral weighted by how often
        they fired, and reuses a representative detector reason string when one
        is available (repo-level signals carry the richest text).
        """
        repo_reason = {s.name: s.reason for s in repo_signals if s.reason}
        ranked = sorted(
            signal_means.items(),
            key=lambda kv: abs(kv[1]["mean_score"] - 0.5) * (1 + min(kv[1]["count"], 50) / 10),
            reverse=True,
        )
        reasons: list[str] = []
        for name, stats in ranked:
            dev = stats["mean_score"] - 0.5
            if abs(dev) < 0.02:
                continue
            lean = "leans AI" if dev > 0 else "leans human"
            count = int(stats["count"])
            detail = repo_reason.get(name)
            where = f"across {count} place(s)" if count > 1 else "in 1 place"
            if detail:
                reasons.append(f"[{name}, {lean}] {detail}")
            else:
                reasons.append(
                    f"[{name}, {lean}] mean score {stats['mean_score']:.2f} {where}."
                )
            if len(reasons) >= limit:
                break
        return reasons or ["Not enough signal to form a confident estimate."]

    def _signal_means(self, file_signal_map, repo_signals) -> dict[str, dict[str, float]]:
        buckets: dict[str, list[Signal]] = defaultdict(list)
        for signals in file_signal_map.values():
            for s in signals:
                if s.informative:
                    buckets[s.name].append(s)
        for s in repo_signals:
            if s.informative:
                buckets[s.name].append(s)
        out: dict[str, dict[str, float]] = {}
        for name, sigs in buckets.items():
            out[name] = {
                "mean_score": sum(s.score for s in sigs) / len(sigs),
                "mean_confidence": sum(s.confidence for s in sigs) / len(sigs),
                "count": float(len(sigs)),
            }
        return out

    def _collect_evidence(self, file_signal_map, repo_signals, limit: int = 60) -> list[EvidenceItem]:
        items: list[EvidenceItem] = []
        for signals in file_signal_map.values():
            for s in signals:
                items.extend(s.evidence)
        for s in repo_signals:
            items.extend(s.evidence)
        items.sort(key=lambda e: e.severity, reverse=True)
        return items[:limit]
