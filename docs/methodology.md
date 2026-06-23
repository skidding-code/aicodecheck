# Methodology

This document explains *how* the AI Project Detector arrives at a score, so the
output can be judged and challenged. The guiding principle is **transparency over
mystique**: there is no black box, and every number can be traced to inputs.

## 1. The probabilistic stance

We never output "this is AI" or "this is human". We output an **estimated
probability** with a **confidence** and **supporting evidence**. A result of
`uncertain` is common, valid, and honest. This is not hedging for its own sake —
it reflects the genuine state of the art: there is **no known method** that
reliably distinguishes AI-generated from human-written code, especially for
short inputs, well-formatted code, or AI-*assisted* (rather than fully
AI-generated) work.

## 2. Pipeline

```
ingestion -> parsing -> detectors -> ensemble -> reporting
```

1. **Ingestion** collects code from a repo/zip/folder/snippet, applies ignore
   rules (excluding dependencies, build output, caches and lockfiles by default),
   and reads git history when present.
2. **Parsing** detects languages and extracts entities (functions, classes,
   methods) — Python via its `ast`, other languages via conservative regex.
3. **Detectors** each emit `Signal`s.
4. **Ensemble** combines signals into a calibrated score.
5. **Reporting** turns scores and evidence into visualizations and advice.

## 3. Signals

A **signal** is one measurement on a 0..1 scale:

* `0.0` → looks strongly human
* `0.5` → no information (neutral)
* `1.0` → looks strongly AI-generated

Each signal also carries an independent **confidence** (how much to trust the
measurement at all — e.g. a 3-line file yields low-confidence stylometry) and a
**weight** (its importance relative to other signals).

Crucially, most signals are **two-sided**: evidence of human authorship pushes a
signal *below* 0.5, not merely "absent". One-sided "presence detectors" (e.g.
"this comment contains LLM-typical phrasing") only fire when the feature is
actually present and stay silent otherwise, so they cannot bias clean code
upward.

### Detector families

| Family | Examples of what it measures |
|--------|------------------------------|
| **structure** | n-gram repetition, compressibility, uniform function lengths, uniform file sizes, cross-file boilerplate |
| **stylometry** | identifier descriptiveness, naming-convention consistency, formatting regularity, vocabulary richness |
| **entropy** | normalized token entropy, cyclomatic-complexity *regularity* across functions |
| **llm_fingerprint** | tutorial-style comments, placeholder/stub markers, over-documentation, emoji in comments, generic TODOs |
| **documentation** | marketing/chatbot phrasing, bullet/emoji density, formulaic README section layout |
| **commit_history** | one-shot "code dump" commits, generic commit messages, non-iterative timelines, gap-then-dump patterns |
| **repo_behavior** | contributor/branch/tag shape, test presence (weak, context only) |

Detectors are **pluggable**: register a new one with
`aiprojectdetector.detectors.register` and it joins the ensemble automatically.

## 4. Ensemble

Signals are aggregated with a **confidence-and-weight-weighted average of each
signal's deviation from 0.5**:

```
weighted_dev = Σ (weightᵢ · confidenceᵢ · multiplierᵢ · (scoreᵢ − 0.5)) / Σ (weightᵢ · confidenceᵢ · multiplierᵢ)
ai_probability = clamp(0.5 + gain · weighted_dev)
```

* **Confidence** of the overall verdict rises with the total amount of evidence
  and falls when signals **disagree**. Disagreement produces lower confidence
  rather than false precision.
* **Evidence score** reflects how many concrete `EvidenceItem`s back the verdict
  and how strong they are.
* **Risk score** = `ai_probability · confidence`, useful for ranking files for
  human review.
* **Classification** maps `(ai_probability, confidence)` into coarse, hedged
  buckets; below a minimum confidence the result is always `uncertain`.

For large inputs, each file contributes a single aggregated signal weighted by
`log(size)` so one big file cannot dominate simply by containing many
sub-signals.

## 5. Calibration

Default thresholds and weights are transparent constants (see
`scoring/calibration.py`). They can be **fit from labeled data**:

* `datasets/calibration` ships a labeled seed corpus (real human code + synthetic
  AI-style code).
* `scripts/build_corpus.py` expands a large on-disk corpus from real repos.
* `scripts/benchmark.py` reports accuracy, precision/recall, per-class mean
  probability, and ROC AUC, and can fit per-signal weight multipliers via
  logistic regression (`scikit-learn`) or a mean-separation fallback.

On the seed corpus the engine achieves a positive separation (AI mean > human
mean) and an ROC AUC well above chance — meaningful, but **far from perfect**,
which is exactly why results are probabilistic.

## 6. Model attribution (experimental)

Optional attribution to a specific tool (ChatGPT/Claude/Gemini/Copilot) is the
**least reliable** output. It matches soft stylistic tendencies against per-tool
profiles, is gated by the overall AI probability, and is always reported at low
confidence. Treat it as entertainment-grade, never as fact.

See [limitations.md](limitations.md) for the failure modes you must keep in mind.
