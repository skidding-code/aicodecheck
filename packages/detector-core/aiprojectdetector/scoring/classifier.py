"""A bundled, dependency-free linear classifier over detector signals.

The additive ensemble (``combine_signals``) is transparent but, being a plain
weighted average, struggles to separate *natural* AI code (concise, lightly
commented, idiomatic) from skilled human code. A logistic-regression classifier
trained on labeled signal vectors learns a decision boundary (with an intercept)
that does measurably better — on the bundled corpus it reaches ~0.85-0.89 ROC
AUC and catches natural-AI samples the average misses, without flagging real
human projects.

Training happens offline with scikit-learn (see scripts/train_classifier.py);
the learned coefficients are bundled as JSON and applied here with nothing but
the standard library, so the engine keeps its light runtime footprint.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field

_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "classifier.json")


@dataclass
class LinearClassifier:
    """logistic-regression: P(AI) = sigmoid(intercept + Σ coef_i · feature_i).

    Features are detector-signal mean scores keyed by signal name. Missing
    signals default to 0.5 (neutral), exactly as during training.
    """

    feature_names: list[str]
    coef: list[float]
    intercept: float = 0.0
    metadata: dict = field(default_factory=dict)

    def predict_proba(self, features: dict[str, float]) -> float:
        z = self.intercept
        for name, w in zip(self.feature_names, self.coef, strict=False):
            z += w * features.get(name, 0.5)
        try:
            return 1.0 / (1.0 + math.exp(-z))
        except OverflowError:
            return 0.0 if z < 0 else 1.0

    def top_contributions(self, features: dict[str, float], k: int = 6) -> list[tuple[str, float]]:
        """Signal contributions (coef·(feature-0.5)) toward the AI decision."""
        contribs = [
            (name, w * (features.get(name, 0.5) - 0.5))
            for name, w in zip(self.feature_names, self.coef, strict=False)
        ]
        contribs.sort(key=lambda t: abs(t[1]), reverse=True)
        return contribs[:k]

    def to_json(self) -> str:
        return json.dumps(
            {
                "feature_names": self.feature_names,
                "coef": self.coef,
                "intercept": self.intercept,
                "metadata": self.metadata,
            },
            indent=2,
        )

    @classmethod
    def from_json(cls, text: str) -> LinearClassifier:
        d = json.loads(text)
        return cls(
            feature_names=d["feature_names"],
            coef=d["coef"],
            intercept=d.get("intercept", 0.0),
            metadata=d.get("metadata", {}),
        )


_cached: LinearClassifier | None = None
_loaded = False


def load_bundled_classifier() -> LinearClassifier | None:
    """Load the bundled model if present, else None (engine falls back cleanly)."""
    global _cached, _loaded
    if _loaded:
        return _cached
    _loaded = True
    path = os.path.normpath(_DATA_PATH)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                _cached = LinearClassifier.from_json(fh.read())
        except (OSError, ValueError, KeyError):
            _cached = None
    return _cached
