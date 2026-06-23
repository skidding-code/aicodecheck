#!/usr/bin/env python3
"""Benchmark the aiprojectdetector engine against the labeled calibration corpus.

Loads ``datasets/calibration/manifest.jsonl``, runs the detector on every labeled
sample, and reports:

  * accuracy at a 0.5 threshold on ``ai_probability``
  * precision / recall / F1 for the "ai" class
  * mean ai_probability per class (the key directional sanity check)
  * a simple separation metric and ROC AUC (rank-based, no sklearn needed)

Optionally (``--fit``) it collects per-signal (feature-vector, label) pairs and
calls ``aiprojectdetector.scoring.calibration.fit_profile`` to learn an auditable
calibration profile, saved to ``datasets/calibration/fitted_profile.json``.

The script depends only on the standard library plus the ``aiprojectdetector``
package (install the engine: ``pip install -e packages/detector-core``).

Usage::

    python scripts/benchmark.py                 # benchmark the seed set
    python scripts/benchmark.py --fit           # also fit + save a profile
    python scripts/benchmark.py --threshold 0.5 --json out.json
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
CALIB_DIR = os.path.join(REPO_ROOT, "datasets", "calibration")
DEFAULT_MANIFEST = os.path.join(CALIB_DIR, "manifest.jsonl")
DEFAULT_PROFILE_OUT = os.path.join(CALIB_DIR, "fitted_profile.json")


def _import_engine():
    try:
        from aiprojectdetector import analyze_snippet  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - environment guard
        sys.stderr.write(
            "ERROR: could not import 'aiprojectdetector'. Activate the venv and/or\n"
            "install the engine:  pip install -e packages/detector-core\n"
            f"(import error: {exc})\n"
        )
        raise SystemExit(2) from exc
    return analyze_snippet


@dataclass
class SampleResult:
    path: str
    label: str          # "human" | "ai"
    language: str
    ai_probability: float
    confidence: float
    features: dict[str, float]


def load_manifest(path: str) -> list[dict]:
    rows: list[dict] = []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"manifest.jsonl line {line_no}: {exc}") from exc
    return rows


def analyze_sample(analyze_snippet, abs_path: str) -> tuple[float, float, dict[str, float]]:
    """Return (ai_probability, confidence, {signal_name: score}) for one file."""
    with open(abs_path, encoding="utf-8", errors="replace") as fh:
        code = fh.read()
    result = analyze_snippet(code, filename=os.path.basename(abs_path))

    features: dict[str, float] = {}
    # A single-file snippet scan yields exactly one file entity whose `.signals`
    # is the per-file signal vector we want for calibration.
    if result.files:
        for signal in result.files[0].signals:
            # Keep only informative signals (they actually fired with confidence).
            if getattr(signal, "informative", True):
                features[signal.name] = float(signal.score)
    return float(result.overall_ai_probability), float(result.confidence), features


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def roc_auc(scores: list[float], labels: list[int]) -> float:
    """Rank-based ROC AUC (probability a random AI sample outranks a human one).

    Returns 0.5 for no separation; >0.5 means AI samples score higher.
    """
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        return float("nan")
    # Mann-Whitney U via rank sum (handles ties with average ranks).
    paired = sorted(zip(scores, labels), key=lambda t: t[0])
    ranks: list[float] = [0.0] * len(paired)
    i = 0
    while i < len(paired):
        j = i
        while j + 1 < len(paired) and paired[j + 1][0] == paired[i][0]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0  # 1-based average rank
        for k in range(i, j + 1):
            ranks[k] = avg_rank
        i = j + 1
    rank_sum_pos = sum(r for r, (_, y) in zip(ranks, paired) if y == 1)
    n_pos, n_neg = len(pos), len(neg)
    u = rank_sum_pos - n_pos * (n_pos + 1) / 2.0
    return u / (n_pos * n_neg)


def confusion(scores: list[float], labels: list[int], threshold: float):
    tp = fp = tn = fn = 0
    for s, y in zip(scores, labels):
        pred = 1 if s >= threshold else 0
        if pred == 1 and y == 1:
            tp += 1
        elif pred == 1 and y == 0:
            fp += 1
        elif pred == 0 and y == 0:
            tn += 1
        else:
            fn += 1
    return tp, fp, tn, fn


def safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


# --------------------------------------------------------------------------- #
def run(args) -> int:
    analyze_snippet = _import_engine()
    rows = load_manifest(args.manifest)
    if not rows:
        sys.stderr.write("No samples in manifest.\n")
        return 1

    results: list[SampleResult] = []
    missing = 0
    for row in rows:
        abs_path = os.path.join(CALIB_DIR, row["path"])
        if not os.path.isfile(abs_path):
            sys.stderr.write(f"WARN: missing sample {row['path']}\n")
            missing += 1
            continue
        ai_p, conf, feats = analyze_sample(analyze_snippet, abs_path)
        results.append(
            SampleResult(
                path=row["path"],
                label=row["label"],
                language=row.get("language", "text"),
                ai_probability=ai_p,
                confidence=conf,
                features=feats,
            )
        )

    if not results:
        sys.stderr.write("No analyzable samples found.\n")
        return 1

    scores = [r.ai_probability for r in results]
    labels = [1 if r.label == "ai" else 0 for r in results]

    ai_scores = [r.ai_probability for r in results if r.label == "ai"]
    human_scores = [r.ai_probability for r in results if r.label == "human"]
    mean_ai = statistics.mean(ai_scores) if ai_scores else float("nan")
    mean_human = statistics.mean(human_scores) if human_scores else float("nan")

    tp, fp, tn, fn = confusion(scores, labels, args.threshold)
    accuracy = safe_div(tp + tn, tp + fp + tn + fn)
    precision = safe_div(tp, tp + fp)
    recall = safe_div(tp, tp + fn)
    f1 = safe_div(2 * precision * recall, precision + recall)
    auc = roc_auc(scores, labels)

    # Per-language means (diagnostic).
    by_lang: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"ai": [], "human": []})
    for r in results:
        by_lang[r.language][r.label].append(r.ai_probability)

    # ----------------------------------------------------------------- report
    print("=" * 64)
    print("AI Project Detector — calibration benchmark")
    print("=" * 64)
    print(f"manifest        : {args.manifest}")
    print(f"samples         : {len(results)} analyzed"
          + (f" ({missing} missing)" if missing else ""))
    print(f"  human         : {len(human_scores)}")
    print(f"  ai (synthetic): {len(ai_scores)}")
    print(f"threshold       : {args.threshold:.2f} on ai_probability")
    print("-" * 64)
    print("Mean ai_probability per class (key directional check):")
    print(f"  human         : {mean_human:.4f}")
    print(f"  ai            : {mean_ai:.4f}")
    print(f"  separation    : {mean_ai - mean_human:+.4f}  (want > 0)")
    print("-" * 64)
    print("Classification metrics (positive class = 'ai'):")
    print(f"  accuracy      : {accuracy:.4f}")
    print(f"  precision     : {precision:.4f}")
    print(f"  recall        : {recall:.4f}")
    print(f"  f1            : {f1:.4f}")
    print(f"  roc_auc       : {auc:.4f}  (0.5 = no separation)")
    print(f"  confusion     : tp={tp} fp={fp} tn={tn} fn={fn}")
    print("-" * 64)
    print("Per-language mean ai_probability (human -> ai):")
    for lang in sorted(by_lang):
        h = by_lang[lang]["human"]
        a = by_lang[lang]["ai"]
        hs = f"{statistics.mean(h):.3f}" if h else "  -  "
        as_ = f"{statistics.mean(a):.3f}" if a else "  -  "
        print(f"  {lang:<12}: human={hs} (n={len(h)})  ai={as_} (n={len(a)})")
    print("=" * 64)

    directionally_correct = (mean_ai > mean_human)
    print(
        "DIRECTIONAL CHECK: "
        + ("PASS — ai mean > human mean" if directionally_correct
           else "FAIL — ai mean is NOT greater than human mean")
    )

    # ----------------------------------------------------------------- fitting
    fitted_summary = None
    if args.fit:
        from aiprojectdetector.scoring.calibration import fit_profile  # noqa: PLC0415

        samples = [(r.features, 1 if r.label == "ai" else 0) for r in results]
        profile = fit_profile(samples)
        with open(args.profile_out, "w", encoding="utf-8") as fh:
            fh.write(profile.to_json())
        fitted_summary = {
            "fitted_on": profile.fitted_on,
            "samples": profile.samples,
            "n_weight_overrides": len(profile.weight_overrides),
            "saved_to": args.profile_out,
        }
        print("-" * 64)
        print(f"Fitted calibration profile ({profile.fitted_on}, "
              f"{profile.samples} samples) -> {args.profile_out}")
        # Show the most influential learned weights.
        top = sorted(profile.weight_overrides.items(), key=lambda kv: kv[1], reverse=True)[:8]
        for name, mult in top:
            print(f"  weight x{mult:<5}  {name}")

    if args.json:
        out = {
            "manifest": args.manifest,
            "threshold": args.threshold,
            "counts": {"human": len(human_scores), "ai": len(ai_scores)},
            "mean_ai_probability": {"human": mean_human, "ai": mean_ai,
                                    "separation": mean_ai - mean_human},
            "metrics": {"accuracy": accuracy, "precision": precision,
                        "recall": recall, "f1": f1, "roc_auc": auc,
                        "tp": tp, "fp": fp, "tn": tn, "fn": fn},
            "directionally_correct": directionally_correct,
            "fitted_profile": fitted_summary,
        }
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2)
        print(f"\nWrote JSON results to {args.json}")

    # Non-zero exit if the corpus fails the basic directional sanity check.
    return 0 if directionally_correct else 3


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--manifest", default=DEFAULT_MANIFEST,
                   help="path to manifest.jsonl (default: seed manifest)")
    p.add_argument("--threshold", type=float, default=0.5,
                   help="ai_probability decision threshold (default: 0.5)")
    p.add_argument("--fit", action="store_true",
                   help="fit a calibration profile and save it")
    p.add_argument("--profile-out", default=DEFAULT_PROFILE_OUT,
                   help="where to write the fitted profile JSON")
    p.add_argument("--json", default=None,
                   help="also write machine-readable results to this path")
    return p


def main(argv: list[str] | None = None) -> int:
    return run(build_parser().parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
