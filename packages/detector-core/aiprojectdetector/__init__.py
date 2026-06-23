"""AI Project Detector — probabilistic estimation of AI-generated code.

Public API::

    from aiprojectdetector import Engine, analyze_snippet, analyze_folder

Every result is an estimate. See ``aiprojectdetector.models.DISCLAIMER``.
"""

from __future__ import annotations

from .engine import ENGINE_VERSION, Engine
from .ingestion import (
    IngestionError,
    load_folder,
    load_github,
    load_snippet,
    load_zip,
)
from .ingestion.loader import IngestOptions, load_files
from .models import (
    DISCLAIMER,
    AIScore,
    AnalysisResult,
    Classification,
    EntityLevel,
)
from .scoring.calibration import CalibrationProfile

__version__ = ENGINE_VERSION

__all__ = [
    "Engine",
    "IngestOptions",
    "IngestionError",
    "load_folder",
    "load_zip",
    "load_github",
    "load_snippet",
    "load_files",
    "analyze_snippet",
    "analyze_folder",
    "analyze_github",
    "analyze_zip",
    "AnalysisResult",
    "AIScore",
    "Classification",
    "EntityLevel",
    "CalibrationProfile",
    "DISCLAIMER",
    "__version__",
]


def analyze_snippet(
    code: str, *, filename: str = "snippet.txt", language: str | None = None, engine: Engine | None = None
) -> AnalysisResult:
    scan = load_snippet(code, filename=filename, language=language)
    return (engine or Engine()).analyze(scan)


def analyze_folder(
    path: str, *, options: IngestOptions | None = None, engine: Engine | None = None
) -> AnalysisResult:
    scan = load_folder(path, options)
    return (engine or Engine()).analyze(scan)


def analyze_github(
    reference: str,
    *,
    token: str | None = None,
    options: IngestOptions | None = None,
    engine: Engine | None = None,
) -> AnalysisResult:
    scan = load_github(reference, options, token=token)
    return (engine or Engine()).analyze(scan)


def analyze_zip(
    zip_path: str, *, options: IngestOptions | None = None, engine: Engine | None = None
) -> AnalysisResult:
    scan = load_zip(zip_path, options)
    return (engine or Engine()).analyze(scan)
