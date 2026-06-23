# Architecture

A monorepo: one shared detection engine, three deployable front-ends, plus the
calibration corpus and tooling.

```
aicodecheck/
├── packages/
│   ├── detector-core/        Python engine (canonical source of truth)
│   └── detector-core-ts/     TypeScript port (shared by Node + browser apps)
├── apps/
│   ├── python-api/           FastAPI + RQ workers + React dashboard  (reference)
│   ├── node-api/             Express + BullMQ workers + React dashboard
│   └── web-standalone/       Browser-only app (no backend; TS engine in a Worker)
├── datasets/calibration/     Labeled human/AI corpus + fitted profile
├── scripts/                  Corpus builder, benchmark/eval
└── docs/                     This documentation
```

## Components

### detector-core (Python)
The brain. Pure, deterministic, dependency-light (pydantic + numpy required;
GitPython/scikit-learn/tree-sitter optional). Exposes `Engine`, `analyze_*`
helpers, the `aipd` CLI, and full pydantic models. See
[`packages/detector-core/README.md`](../packages/detector-core/README.md).

### detector-core-ts (TypeScript)
A faithful port of the unit-level heuristics and ensemble, wire-compatible with
the Python output (same snake_case JSON fields). Runs in Node and in the browser
(node-only bits like zlib are isolated behind adapters). Powers the Node API and
the no-backend app so all three front-ends share consistent logic.

### python-api (reference application)
```
FastAPI app ──> job queue ──> worker ──> Engine ──> Postgres
     │            (RQ/Redis or in-process pool)        │
     └── React dashboard (Vite) ───────────────────────┘
```
* **API**: all required endpoints (`/analyze-*`, `/report/{id}`, `/analysis/{id}`,
  `/history`, `/repository/{owner}/{repo}`, `/jobs/{id}`, `/detectors`).
* **Async**: heavy work (repository clone, zip) is queued; light work (snippet,
  file, folder) runs synchronously. Queue backend is RQ+Redis when
  `AIPD_REDIS_URL` is set, otherwise an in-process thread pool (zero infra).
* **Persistence**: SQLAlchemy; SQLite by default, Postgres in production. Reports,
  jobs, scores, and an analysis cache are stored.
* **Security**: rate limiting, Fernet token encryption, SSRF guard, upload/snippet
  size limits, safe zip extraction (zip-bomb + path-traversal protection).

### node-api
The same REST surface implemented with Express + BullMQ, reusing
`detector-core-ts`. Demonstrates the engine is not Python-locked.

### web-standalone
Everything runs client-side. Files never leave the browser; the TS engine runs
in a Web Worker. Ideal for privacy-sensitive analysis and static hosting.

## Data flow (repository analysis)

1. Client `POST /analyze-repository` with a URL/`owner/repo` (+optional token).
2. API validates the reference (SSRF guard), encrypts any token, creates a `Job`,
   and enqueues it (or returns a cached report).
3. Worker clones the repo, ingests it, runs the `Engine`, stores the
   `AnalysisResult`, and marks the job finished.
4. Client polls `GET /analysis/{job_id}` until the report is ready, then renders
   the dashboard.

## Deployment

`docker-compose.yml` wires Postgres, Redis, the API, a worker, and the front-ends
into production-style containers. See the root README for commands.

## Extensibility

* **New detector**: subclass `Detector`, implement `unit_signals`/`repo_signals`,
  call `register()`. No engine changes needed.
* **New calibration**: fit a `CalibrationProfile` from labeled data and pass it to
  `Engine(profile=...)`.
* **New input type**: add a loader returning a `Scan`; the rest of the pipeline is
  unchanged.
