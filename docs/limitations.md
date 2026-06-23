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

## Calibration honesty

Benchmark numbers in this repo come from a **small** seed corpus and synthetic
AI samples whose "AI" label is an approximate stylistic proxy. They demonstrate
that the signals carry information; they are **not** a guarantee of real-world
accuracy on your data. Re-calibrate on data representative of your use case
before relying on thresholds.
