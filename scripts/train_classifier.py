#!/usr/bin/env python3
"""Train the bundled logistic-regression classifier over detector signals.

Reads labeled samples from datasets/calibration/seed/{ai,ai_natural} (label=1)
and {human,human_modern} (label=0), extracts each file's signal-mean vector via
the engine, fits a logistic regression (scikit-learn), and writes the learned
coefficients to packages/detector-core/aiprojectdetector/data/classifier.json.

Inference is dependency-free (see aiprojectdetector.scoring.classifier); only
training needs scikit-learn:

    pip install -e "packages/detector-core[ml,dev]"
    python scripts/train_classifier.py
"""

from __future__ import annotations

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "datasets", "calibration", "seed")
OUT = os.path.join(
    ROOT, "packages", "detector-core", "aiprojectdetector", "data", "classifier.json"
)

AI_DIRS = ["ai", "ai_natural"]
HUMAN_DIRS = ["human", "human_modern"]


def _feature_vector(path: str) -> dict[str, float]:
    from aiprojectdetector import analyze_snippet  # noqa: PLC0415

    src = open(path, encoding="utf-8", errors="replace").read()
    r = analyze_snippet(src, filename=os.path.basename(path))
    return {s["signal"]: s["mean_score"] for s in r.visualizations.signal_breakdown}


def _gather() -> list[tuple[dict[str, float], int]]:
    samples = []
    for d in AI_DIRS:
        for p in glob.glob(os.path.join(SEED, d, "*")):
            if os.path.isfile(p):
                samples.append((_feature_vector(p), 1))
    for d in HUMAN_DIRS:
        for p in glob.glob(os.path.join(SEED, d, "*")):
            if os.path.isfile(p):
                samples.append((_feature_vector(p), 0))
    return samples


def main() -> int:
    try:
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.model_selection import cross_val_score
    except ImportError:
        print("scikit-learn is required to TRAIN (inference is dependency-free).", file=sys.stderr)
        print("Install: pip install -e 'packages/detector-core[ml,dev]'", file=sys.stderr)
        return 2

    samples = _gather()
    n_ai = sum(1 for _, y in samples if y == 1)
    print(f"samples: {len(samples)} (AI={n_ai}, human={len(samples) - n_ai})")
    if n_ai < 5 or len(samples) - n_ai < 5:
        print("Not enough labeled samples.", file=sys.stderr)
        return 2

    keys = sorted({k for f, _ in samples for k in f})
    X = np.array([[f.get(k, 0.5) for k in keys] for f, _ in samples])
    y = np.array([lbl for _, lbl in samples])

    model = LogisticRegression(max_iter=5000, class_weight="balanced", C=1.0)
    auc = cross_val_score(model, X, y, cv=5, scoring="roc_auc")
    model.fit(X, y)
    print(f"5-fold CV ROC AUC: {auc.mean():.3f} +/- {auc.std():.3f}")

    payload = {
        "feature_names": keys,
        "coef": [round(float(c), 6) for c in model.coef_[0]],
        "intercept": round(float(model.intercept_[0]), 6),
        "metadata": {
            "model": "logistic_regression",
            "cv_roc_auc": round(float(auc.mean()), 4),
            "cv_roc_auc_std": round(float(auc.std()), 4),
            "n_samples": len(samples),
            "n_ai": n_ai,
            "n_human": len(samples) - n_ai,
            "note": "Probabilistic estimate only. See docs/limitations.md.",
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    print(f"wrote {OUT}")
    # Show the most influential signals.
    ranked = sorted(zip(keys, model.coef_[0]), key=lambda t: -abs(t[1]))
    print("top signals (+ => AI):")
    for k, c in ranked[:10]:
        print(f"  {k:26} {c:+.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
