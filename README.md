# AI Project Detector

Analyze a GitHub repository (or a folder, ZIP, file, or pasted snippet) and get
a **probabilistic estimate** of whether the code is likely human-written,
AI-assisted, or heavily AI-generated — with transparent reasoning and concrete
supporting evidence for every score.

> ⚠️ **This tool never claims certainty.** AI-authorship detection is inherently
> probabilistic and produces both false positives and false negatives. Treat
> every score as an estimate, and never as the sole basis for a consequential
> decision about a person or project. `uncertain` is a valid, common, and
> honest outcome.

## What's in here

This is a monorepo with one shared brain and three deployable front-ends, exactly
as requested:

| Path | What it is | Stack |
|------|------------|-------|
| `packages/detector-core` | **Canonical detection engine** (the brain) | Python |
| `packages/detector-core-ts` | TypeScript port of the engine | TypeScript |
| `apps/python-api` | **Reference app**: REST API + workers + dashboard | FastAPI · RQ · Postgres · Redis · React |
| `apps/node-api` | Node variant of the API + dashboard | Express · BullMQ · React |
| `apps/web-standalone` | **No-backend** variant: runs entirely in the browser | React · TS engine (Web Worker) |
| `datasets/calibration` | Labeled human/AI calibration corpus + builder | — |
| `scripts/` | Corpus builder, benchmark, evaluation | Python |

The Python engine is the source of truth; the TypeScript engine mirrors its core
heuristics so the Node and browser-only apps share consistent logic.

## Quick start

### The engine (Python)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e "packages/detector-core[all,dev]"
aipd --snippet "def add(a, b):\n    return a + b" --language python
aipd owner/repo            # clone + analyze a GitHub repo
```

### Full stack (Docker Compose)

```bash
docker compose up --build
# Python dashboard:   http://localhost:5173   (python-api frontend)
# Python REST API:    http://localhost:8000/docs
# Node dashboard:     http://localhost:8081   (node-api frontend)
# Node REST API:      http://localhost:8080/
# Browser-only app:   http://localhost:4173   (no backend; code stays local)
```

Brings up Postgres, Redis, the FastAPI API + worker, and all three front-ends.
The Node API and the browser-only app are self-contained and need no database.

## Inputs supported

GitHub URLs · `owner/repo` · GitHub Enterprise · private repos (OAuth / PAT) ·
ZIP uploads · individual files · drag-and-drop folders · pasted snippets.

## What it analyzes

Repository / folder / file / class / function / method / snippet / line-range
levels, plus git history, commit messages, branches, tags, contributors,
documentation, CI/CD config, and dependency manifests. Dependency, build, and
cache directories (`node_modules`, `vendor`, `dist`, `target`, …) and lockfiles
are excluded by default; ignore rules are configurable like `.gitignore`.

## Detection approach (heuristic + statistical, explainable)

Structure (repetition, uniform function lengths, boilerplate) · stylometry
(naming, formatting, descriptiveness, vocabulary) · entropy & complexity
regularity · LLM fingerprints (tell-tale comments, placeholders, over-docs,
emoji) · documentation phrasing · commit-history patterns (one-shot dumps,
generic messages, non-iterative timelines) · repo behavior. Signals feed a
transparent, calibrated ensemble; **disagreement lowers confidence** instead of
producing false precision.

See [`packages/detector-core/README.md`](packages/detector-core/README.md) for
engine internals and [`docs/`](docs/) for architecture, the API reference, the
methodology, and an explicit **limitations** write-up.

## Responsible-use notes

* Scores are estimates with confidence and evidence — read both.
* Optional model attribution (ChatGPT/Claude/Gemini/Copilot) is **experimental,
  low-confidence, and clearly labeled**. Do not present it as fact.
* If an assessment affects a person, corroborate with non-automated methods and
  give them a chance to respond.

## License

MIT — see [LICENSE](LICENSE).
