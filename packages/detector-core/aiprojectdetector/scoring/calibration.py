"""Calibration: thresholds and (optional) data-fitted signal weights.

The engine ships with transparent default thresholds. When a labeled corpus is
available (see scripts/build_corpus.py and the ``datasets/calibration`` seed
set), :func:`fit_profile` can learn per-signal weight multipliers and decision
thresholds. Fitting uses scikit-learn when installed and falls back to a simple
mean-separation heuristic otherwise, so the package never hard-depends on ML
libraries.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field

from ..optional_deps import HAS_SKLEARN


@dataclass
class CalibrationProfile:
    """Tunable parameters for turning signals into a verdict."""

    # ai_probability thresholds for classification buckets.
    t_human: float = 0.42
    t_assisted_low: float = 0.52
    t_assisted_high: float = 0.62
    t_generated: float = 0.72
    # Minimum confidence below which we always say "uncertain".
    min_confidence: float = 0.25
    # Gain applied to the aggregated deviation (amplifies agreement).
    gain: float = 1.25
    # Per-signal weight multipliers learned from data (name -> multiplier).
    weight_overrides: dict[str, float] = field(default_factory=dict)
    # Bookkeeping.
    fitted_on: str = "defaults"
    samples: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)

    @classmethod
    def from_json(cls, text: str) -> CalibrationProfile:
        return cls(**json.loads(text))


DEFAULT_PROFILE = CalibrationProfile()

# A higher-recall operating point: lower thresholds + more gain so borderline,
# lightly-tell'd AI is flagged sooner. This DELIBERATELY trades precision for
# recall — it will flag more clean human code. Use when missing AI is costlier
# than a false accusation (and never as sole evidence). See docs/limitations.md.
HIGH_RECALL_PROFILE = CalibrationProfile(
    t_human=0.40,
    t_assisted_low=0.48,
    t_assisted_high=0.57,
    t_generated=0.66,
    min_confidence=0.20,
    gain=1.6,
    fitted_on="high_recall_defaults",
)


def fit_profile(
    samples: list[tuple[dict[str, float], int]],
    base: CalibrationProfile | None = None,
) -> CalibrationProfile:
    """Learn weight multipliers from labeled signal vectors.

    ``samples`` is a list of (signal_name -> score, label) where label is 1 for
    AI-generated and 0 for human. Returns a new CalibrationProfile. This is a
    light, explainable fit — not a black box — so the resulting weights remain
    auditable.
    """
    base = base or CalibrationProfile()
    if not samples:
        return base

    names = sorted({n for feats, _ in samples for n in feats})
    if HAS_SKLEARN and len(samples) >= 20:
        overrides = _fit_sklearn(samples, names)
    else:
        overrides = _fit_mean_separation(samples, names)

    return CalibrationProfile(
        t_human=base.t_human,
        t_assisted_low=base.t_assisted_low,
        t_assisted_high=base.t_assisted_high,
        t_generated=base.t_generated,
        min_confidence=base.min_confidence,
        gain=base.gain,
        weight_overrides=overrides,
        fitted_on="sklearn-logistic" if (HAS_SKLEARN and len(samples) >= 20) else "mean-separation",
        samples=len(samples),
    )


def _fit_mean_separation(samples, names) -> dict[str, float]:
    """Weight = how well a signal separates the two classes (|mean_ai - mean_human|)."""
    overrides: dict[str, float] = {}
    for n in names:
        ai_vals = [feats.get(n, 0.5) for feats, lbl in samples if lbl == 1 and n in feats]
        hu_vals = [feats.get(n, 0.5) for feats, lbl in samples if lbl == 0 and n in feats]
        if not ai_vals or not hu_vals:
            continue
        sep = abs(_mean(ai_vals) - _mean(hu_vals))
        # Map separation 0..0.4 -> multiplier 0.5..2.0.
        overrides[n] = round(0.5 + min(1.5, sep / 0.4 * 1.5), 3)
    return overrides


def _fit_sklearn(samples, names) -> dict[str, float]:
    import numpy as np  # noqa: PLC0415
    from sklearn.linear_model import LogisticRegression  # noqa: PLC0415

    x = np.array([[feats.get(n, 0.5) for n in names] for feats, _ in samples])
    y = np.array([lbl for _, lbl in samples])
    if len(set(y.tolist())) < 2:
        return _fit_mean_separation(samples, names)
    model = LogisticRegression(max_iter=1000)
    model.fit(x, y)
    coefs = model.coef_[0]
    max_abs = max(abs(c) for c in coefs) or 1.0
    # Normalize absolute coefficients to multipliers in 0.5..2.0.
    return {n: round(0.5 + 1.5 * abs(c) / max_abs, 3) for n, c in zip(names, coefs, strict=False)}


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0
