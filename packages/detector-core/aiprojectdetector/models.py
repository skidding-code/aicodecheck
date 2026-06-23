"""Core data models for the AI Project Detector engine.

Everything the engine produces is *probabilistic*. No field in this module
should ever be interpreted as a definitive statement that code was or was not
written by an AI. The vocabulary is deliberately hedged ("likely", "possibly",
"estimated") to reflect that AI-authorship detection has irreducible false
positive and false negative rates.
"""

from __future__ import annotations

import datetime as _dt
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

# The single most important sentence in this codebase. Surfaced in every report.
DISCLAIMER = (
    "These results are probabilistic estimates, not proof. AI-authorship "
    "detection is inherently uncertain and produces both false positives and "
    "false negatives. Do not use these scores as the sole basis for any "
    "consequential decision about a person or project."
)


def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


class EntityLevel(str, Enum):
    """The granularity at which an analysis applies."""

    repository = "repository"
    folder = "folder"
    file = "file"
    klass = "class"
    function = "function"
    method = "method"
    snippet = "snippet"
    line_range = "line_range"


class Classification(str, Enum):
    """Human-readable bucket for an AI-probability score.

    Buckets are intentionally coarse and hedged. ``uncertain`` is a first-class
    outcome: when evidence is weak we say so rather than guessing.
    """

    likely_human = "likely_human"
    possibly_ai_assisted = "possibly_ai_assisted"
    likely_ai_assisted = "likely_ai_assisted"
    likely_ai_generated = "likely_ai_generated"
    uncertain = "uncertain"


class EvidenceItem(BaseModel):
    """A single, concrete, human-readable piece of supporting evidence.

    Evidence is what makes a score explainable. Every signal that moves a score
    away from neutral should attach at least one EvidenceItem describing *why*.
    """

    detector: str
    signal: str
    message: str = Field(description="Plain-language explanation a human can read.")
    severity: float = Field(0.0, ge=0.0, le=1.0, description="How strongly this leans AI (0..1).")
    path: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    snippet: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class Signal(BaseModel):
    """One measurable indicator produced by a detector.

    ``score`` is calibrated so that 0.0 means "looks strongly human", 0.5 means
    "neutral / no information", and 1.0 means "looks strongly AI-generated".
    ``confidence`` is independent: how much we trust this measurement at all
    (e.g. a 3-line file yields low-confidence stylometry).
    """

    name: str
    detector: str
    score: float = Field(0.5, ge=0.0, le=1.0)
    weight: float = Field(1.0, ge=0.0, description="Relative importance in the ensemble.")
    confidence: float = Field(0.5, ge=0.0, le=1.0)
    reason: str = ""
    evidence: list[EvidenceItem] = Field(default_factory=list)

    @property
    def informative(self) -> bool:
        """A signal carries information only if it deviates from neutral."""
        return abs(self.score - 0.5) > 1e-6 and self.confidence > 0.0


class AIScore(BaseModel):
    """The aggregate probabilistic verdict for an entity."""

    ai_probability: float = Field(0.5, ge=0.0, le=1.0)
    human_probability: float = Field(0.5, ge=0.0, le=1.0)
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    evidence_score: float = Field(
        0.0, ge=0.0, le=1.0, description="How much concrete evidence backs this verdict."
    )
    risk_score: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Combined ai_probability x confidence; useful for ranking/triage.",
    )
    classification: Classification = Classification.uncertain
    reasons: list[str] = Field(default_factory=list)


class AttributionGuess(BaseModel):
    """A *highly speculative* guess at which tool may have produced the code.

    This is the least reliable output of the whole system and is always shown
    as a low-confidence estimate. Never present it as fact.
    """

    source: str  # e.g. "chatgpt", "claude", "gemini", "copilot", "other_llm"
    probability: float = Field(0.0, ge=0.0, le=1.0)
    rationale: str = ""
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class EntityAnalysis(BaseModel):
    """Analysis of a single entity (file, function, class, snippet, ...)."""

    level: EntityLevel
    identifier: str = Field(description="Stable id: path, or path::symbol for sub-file entities.")
    name: str
    language: str | None = None
    path: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    loc: int = 0
    score: AIScore = Field(default_factory=AIScore)
    signals: list[Signal] = Field(default_factory=list)
    parent: str | None = None


class CommitInfo(BaseModel):
    sha: str
    author: str = ""
    author_email: str = ""
    timestamp: _dt.datetime | None = None
    message: str = ""
    insertions: int = 0
    deletions: int = 0
    files_changed: int = 0


class CommitAnalysis(BaseModel):
    available: bool = False
    total_commits: int = 0
    total_authors: int = 0
    score: AIScore = Field(default_factory=AIScore)
    signals: list[Signal] = Field(default_factory=list)
    timeline: list[CommitInfo] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class ContributorStat(BaseModel):
    name: str
    email: str = ""
    commits: int = 0
    insertions: int = 0
    deletions: int = 0
    first_commit: _dt.datetime | None = None
    last_commit: _dt.datetime | None = None


class ContributorAnalysis(BaseModel):
    available: bool = False
    contributors: list[ContributorStat] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class VisualizationData(BaseModel):
    """Pre-computed, serializable payloads the frontend renders directly."""

    folder_heatmap: list[dict[str, Any]] = Field(default_factory=list)
    file_heatmap: list[dict[str, Any]] = Field(default_factory=list)
    classification_pie: list[dict[str, Any]] = Field(default_factory=list)
    commit_timeline: list[dict[str, Any]] = Field(default_factory=list)
    contributor_activity: list[dict[str, Any]] = Field(default_factory=list)
    signal_breakdown: list[dict[str, Any]] = Field(default_factory=list)
    similarity_matrix: dict[str, Any] = Field(default_factory=dict)
    dependency_graph: dict[str, Any] = Field(default_factory=dict)


class AnalysisTarget(BaseModel):
    kind: str = "unknown"  # repository | folder | file | snippet | zip
    name: str = ""
    source: str = ""  # url, path, or "<snippet>"
    owner: str | None = None
    repo: str | None = None
    ref: str | None = None
    languages: dict[str, int] = Field(default_factory=dict)
    total_files: int = 0
    analyzed_files: int = 0
    skipped_files: int = 0
    total_loc: int = 0
    bytes_scanned: int = 0


class AnalysisResult(BaseModel):
    """The top-level structured response returned by the engine and the API."""

    id: str
    schema_version: int = 1
    target: AnalysisTarget
    overall_ai_probability: float = 0.5
    human_probability: float = 0.5
    classification: Classification = Classification.uncertain
    confidence: float = 0.0
    score: AIScore = Field(default_factory=AIScore)

    files: list[EntityAnalysis] = Field(default_factory=list)
    folders: list[EntityAnalysis] = Field(default_factory=list)
    functions: list[EntityAnalysis] = Field(default_factory=list)
    snippets: list[EntityAnalysis] = Field(default_factory=list)

    commit_analysis: CommitAnalysis = Field(default_factory=CommitAnalysis)
    contributor_analysis: ContributorAnalysis = Field(default_factory=ContributorAnalysis)
    attribution: list[AttributionGuess] = Field(default_factory=list)

    reasons: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    visualizations: VisualizationData = Field(default_factory=VisualizationData)
    recommendations: list[str] = Field(default_factory=list)

    warnings: list[str] = Field(default_factory=list)
    elapsed_seconds: float = 0.0
    engine_version: str = "0.1.0"
    disclaimer: str = DISCLAIMER
    generated_at: _dt.datetime = Field(default_factory=_utcnow)
