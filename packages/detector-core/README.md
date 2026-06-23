# aiprojectdetector (detector-core)

The shared, canonical detection engine for **AI Project Detector**. It estimates
the *probability* that source code was AI-generated and explains every score
with concrete evidence. It never claims certainty.

> ⚠️ These results are probabilistic estimates, not proof. AI-authorship
> detection has irreducible false-positive and false-negative rates. Do not use
> these scores as the sole basis for any consequential decision about a person
> or project.

## Install

```bash
pip install -e "packages/detector-core[all,dev]"
```

Only `pydantic` and `numpy` are required. Optional extras unlock features and
degrade gracefully when missing:

| Extra | Enables |
|-------|---------|
| `git` (GitPython) | richer git tooling (CLI `git` is used by default) |
| `ml` (scikit-learn) | logistic-regression calibration fitting |
| `treesitter` | more accurate multi-language entity extraction |

## Usage

```python
from aiprojectdetector import Engine, analyze_snippet, analyze_folder, analyze_github

# A snippet
result = analyze_snippet("def add(a, b):\n    return a + b\n", filename="x.py")
print(result.overall_ai_probability, result.classification, result.confidence)

# A local folder / repo
result = analyze_folder("/path/to/project")

# A GitHub repo (public or, with a token, private / Enterprise)
result = analyze_github("owner/repo", token="ghp_...")

# Everything is a pydantic model -> JSON
print(result.model_dump_json(indent=2))
```

CLI:

```bash
aipd ./my-project
aipd owner/repo
aipd archive.zip --json report.json
aipd --snippet "def f(): pass" --language python
```

## How it works

```
ingestion  ->  parsing  ->  detectors  ->  ensemble  ->  reporting
(clone/zip/    (language/   (heuristic     (calibrated   (scores,
 walk/ignore)   AST/funcs)   signals)       aggregation)  evidence, viz)
```

* **Ingestion** (`ingestion/`): clone repos, safely extract ZIPs (zip-bomb &
  path-traversal protection), walk folders honoring gitignore-style rules, and
  read git history.
* **Parsing** (`parsing/`): language detection and function/class extraction
  (Python via `ast`, others via robust regex).
* **Detectors** (`detectors/`): pluggable components that emit `Signal`s on a
  0..1 scale (0.5 = no information). Built-ins cover structure, stylometry,
  entropy/complexity, LLM fingerprints, documentation, commit history and repo
  behavior. Register your own with `detectors.register`.
* **Ensemble** (`scoring/`): a transparent, confidence-and-weight-weighted
  aggregation with data-fittable calibration. Disagreement lowers confidence
  rather than producing false precision.
* **Reporting** (`reporting.py`): heatmaps, timelines, similarity matrices,
  dependency graphs, and plain-language recommendations.

Every signal carries a human-readable `reason` and concrete `EvidenceItem`s, so
results are explainable end to end.

## Design principles

1. **Probabilistic, never certain.** `uncertain` is a first-class outcome.
2. **Explainable.** No score without reasons and evidence.
3. **Pluggable.** New detectors and calibration profiles need no core changes.
4. **Honest about confounds.** Style signals confounded by formatters/linters
   are documented as such and weighted low.

## Tests

```bash
cd packages/detector-core && pytest
```
