# Limitations & responsible use

**Read this before trusting any number this tool produces.**

## The core truth

There is **no reliable way to prove** that source code was written by an AI.
Every technique here is a *heuristic correlation*, and correlations break. This
tool estimates probabilities; it does not detect facts.

## Known failure modes

### False positives (human code flagged as AI)
* **Well-formatted, well-documented code.** Linters/formatters (black, prettier,
  gofmt) and good docstring habits mimic the regularity we associate with AI. We
  mitigate this by down-weighting formatter-confounded signals and making them
  two-sided, but the bias cannot be eliminated.
* **Boilerplate-heavy projects** (CRUD apps, generated scaffolds, test suites
  with repeated assertion patterns).
* **Junior or tutorial-following developers**, who naturally write
  tutorial-style comments.
* **Non-native English speakers** whose comment phrasing may resemble templated
  text.
* **Squashed / single-commit repositories** (e.g. imported code, mirrors), which
  trip "one-shot dump" commit signals despite being human.

### False negatives (AI code not flagged)
* **AI-assisted** code that a human edited, refactored, or interleaved with their
  own work — often indistinguishable from fully-human code.
* **Code generated then heavily modified.**
* **Short snippets**, where there is simply not enough signal. The tool correctly
  reports low confidence here, but a low-confidence "uncertain" is easy to
  misread.
* **Models or prompts specifically aimed at evading detection.**

### Adversarial fragility
Anyone aware of these heuristics can defeat them: vary function lengths, strip
tutorial comments, hand-write commit histories, run a "humanizer". The signals
are not robust to deliberate evasion and are not intended to be.

## Things this tool must NOT be used for, by itself

* Academic misconduct decisions or grading.
* Hiring, firing, or performance evaluation.
* Any consequential judgment about a specific person's honesty.

If a result affects a person, **corroborate with non-automated methods** (e.g. a
conversation, a live exercise) and give them an opportunity to respond. A
probability is not evidence of wrongdoing.

## Language coverage

Entity-level analysis is strongest for **Python** (full AST). Other languages use
regex-based extraction, which is approximate; per-function signals there are
weaker, and some languages (e.g. Java in our benchmark) separate poorly.

## Data & privacy

* Access tokens are encrypted at rest (Fernet) and never logged.
* Repository/zip *inputs* are not retained after analysis; only the resulting
  report is stored.
* The SSRF guard refuses to clone from hosts resolving to private/loopback
  ranges (configurable).

## Empirical finding: natural AI code is (often) indistinguishable

We ran a controlled experiment: take real human modules (CPython stdlib, Flask,
click) and have independent agents re-implement the *same functionality* in a
natural, un-styled way, then compare. Results:

* The **only** features that reliably separated the classes were human
  *maintenance artifacts* (TODO/FIXME/`noqa`, commented-out code) and *comment
  polish* (humans write terse fragments; AI writes full sentences). These are
  implemented as the ``authorship_artifacts`` detector.
* **Stylized** AI (tutorial-style comments, emoji, marketing prose) is caught
  reliably.
* **Natural** AI (concise, idiomatic, lightly commented, fully type-hinted) was
  **not** separable: across 10 independent AI re-implementations the engine's
  mean AI-probability was ~0.40 — *identical to human code* — with 0/10 crossing
  0.5. A logistic classifier trained specifically on this boundary still could
  not lift them, because in the measured feature space natural AI and skilled
  modern human code genuinely overlap.

Takeaway: this tool detects **stylistic AI fingerprints**, not "AI authorship"
in the abstract. A capable model writing clean, comment-light code is at or
beyond the limit of static detection. Pushing thresholds down to catch it
(`HIGH_RECALL_PROFILE`, or the trained `--classifier` mode) trades precision for
recall and will flag tidy human code. There is no setting that reliably catches
concise natural AI *without* a real false-positive cost — and we do not pretend
otherwise.

## Operating points

* **Default (ensemble):** balanced; hedges to `uncertain` on borderline code and
  avoids accusing real human projects.
* **`--classifier`:** a trained logistic model over the signals; better on
  stylized AI, but still cannot separate natural AI and may label it
  `likely_human`.
* **`--high-recall`:** lower thresholds to surface borderline AI sooner; expect
  more false positives. Never use as sole evidence.

## Calibration honesty

Benchmark numbers in this repo come from a **small** seed corpus and synthetic
AI samples whose "AI" label is an approximate stylistic proxy. They demonstrate
that the signals carry information; they are **not** a guarantee of real-world
accuracy on your data. Re-calibrate on data representative of your use case
before relying on thresholds.
