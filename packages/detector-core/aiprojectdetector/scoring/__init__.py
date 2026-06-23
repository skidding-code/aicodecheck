"""Signal aggregation and calibration."""

from .calibration import DEFAULT_PROFILE, HIGH_RECALL_PROFILE, CalibrationProfile
from .classifier import LinearClassifier, load_bundled_classifier
from .ensemble import classify, combine_signals

__all__ = [
    "combine_signals",
    "classify",
    "CalibrationProfile",
    "DEFAULT_PROFILE",
    "HIGH_RECALL_PROFILE",
    "LinearClassifier",
    "load_bundled_classifier",
]
