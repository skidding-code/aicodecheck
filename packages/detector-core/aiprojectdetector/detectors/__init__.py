"""Detector registry.

The registry is the plugin seam: external packages can register additional
detectors via ``register()`` (e.g. an entry-point hook) without modifying the
engine. ``default_detectors()`` returns the built-in set.
"""

from __future__ import annotations

from .base import AnalysisUnit, Detector, file_to_unit
from .commit_history import CommitHistoryDetector
from .documentation import DocumentationDetector
from .entropy import EntropyDetector
from .llm_fingerprint import LLMFingerprintDetector
from .repo_behavior import RepoBehaviorDetector
from .structure import StructureDetector
from .stylometry import StylometryDetector

_REGISTRY: dict[str, type[Detector]] = {}


def register(detector_cls: type[Detector]) -> type[Detector]:
    """Register a detector class (usable as a decorator)."""
    _REGISTRY[detector_cls.name] = detector_cls
    return detector_cls


def registered() -> dict[str, type[Detector]]:
    return dict(_REGISTRY)


for _cls in (
    StructureDetector,
    StylometryDetector,
    EntropyDetector,
    LLMFingerprintDetector,
    DocumentationDetector,
    CommitHistoryDetector,
    RepoBehaviorDetector,
):
    register(_cls)


def default_detectors() -> list[Detector]:
    """Instantiate the built-in detector set."""
    return [cls() for cls in _REGISTRY.values()]


__all__ = [
    "AnalysisUnit",
    "Detector",
    "file_to_unit",
    "register",
    "registered",
    "default_detectors",
    "StructureDetector",
    "StylometryDetector",
    "EntropyDetector",
    "LLMFingerprintDetector",
    "DocumentationDetector",
    "CommitHistoryDetector",
    "RepoBehaviorDetector",
]
