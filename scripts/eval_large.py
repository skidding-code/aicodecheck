#!/usr/bin/env python3
"""Large-scale evaluation: human vs AI files/projects.

Analyzes every file under --human (label 0) and --ai (label 1), then reports
class means, separation, ROC AUC, and a confusion matrix / precision / recall at
a threshold — under the default engine and (optionally) high-recall + classifier.

Usage:
    python scripts/eval_large.py --human /tmp/eval/human --ai /tmp/eval/ai
"""

from __future__ import annotations

import argparse
import glob
import os

from aiprojectdetector import Engine
from aiprojectdetector.ingestion.loader import load_snippet
from aiprojectdetector.scoring.calibration import HIGH_RECALL_PROFILE

EXTS = (".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".java", ".rb", ".rs")


def _files(d: str) -> list[str]:
    return [p for p in glob.glob(os.path.join(d, "**", "*"), recursive=True)
            if os.path.isfile(p) and p.endswith(EXTS)]


def _score(engine: Engine, path: str) -> float:
    src = open(path, encoding="utf-8", errors="replace").read()
    if not src.strip():
        return 0.5
    return engine.analyze(load_snippet(src, filename=os.path.basename(path))).overall_ai_probability


def _roc_auc(pos: list[float], neg: list[float]) -> float:
    # Probability a random positive outranks a random negative (Mann-Whitney).
    if not pos or not neg:
        return float("nan")
    wins = ties = 0
    for p in pos:
        for n in neg:
            if p > n:
                wins += 1
            elif p == n:
                ties += 1
    return (wins + 0.5 * ties) / (len(pos) * len(neg))


def _metrics(name: str, ai: list[float], human: list[float], thr: float = 0.5) -> None:
    tp = sum(1 for x in ai if x >= thr)
    fn = len(ai) - tp
    fp = sum(1 for x in human if x >= thr)
    tn = len(human) - fp
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    acc = (tp + tn) / (len(ai) + len(human))
    print(f"\n=== {name} ===")
    print(f"  mean ai_prob:  AI={sum(ai)/len(ai):.3f}   human={sum(human)/len(human):.3f}   "
          f"sep={sum(ai)/len(ai) - sum(human)/len(human):+.3f}")
    print(f"  ROC AUC:       {_roc_auc(ai, human):.3f}")
    print(f"  @thr={thr}: acc={acc:.3f} precision={prec:.3f} recall={rec:.3f} f1={f1:.3f}")
    print(f"             confusion: tp={tp} fp={fp} tn={tn} fn={fn}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--human", required=True)
    ap.add_argument("--ai", required=True)
    ap.add_argument("--threshold", type=float, default=0.5)
    args = ap.parse_args()

    human_files = _files(args.human)
    ai_files = _files(args.ai)
    print(f"human files: {len(human_files)} | ai files: {len(ai_files)}")

    engines = {
        "DEFAULT (ensemble)": Engine(),
        "HIGH_RECALL": Engine(profile=HIGH_RECALL_PROFILE),
        "CLASSIFIER": Engine(use_classifier=True),
    }
    for name, eng in engines.items():
        ai = [_score(eng, p) for p in ai_files]
        hu = [_score(eng, p) for p in human_files]
        _metrics(name, ai, hu, args.threshold)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
