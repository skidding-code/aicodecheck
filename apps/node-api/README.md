# AI Project Detector — Node.js API

An **Express + TypeScript (ESM)** REST API for probabilistic estimation of
AI-generated code. It mirrors the [Python API](../python-api)'s surface and
reuses the **shared TypeScript engine**
([`@aicodecheck/detector-core`](../../packages/detector-core-ts)) — the same
detectors, scoring and `AnalysisResult` shape (snake_case, wire-compatible with
the Python API).

> **All results are probabilistic estimates, never proof.** Every response
> carries a `disclaimer` field; the dashboard shows a persistent banner.

## Design: zero infrastructure by default

The app runs with **no external services**:

| Concern | Default (zero infra) | Optional (production) |
| --- | --- | --- |
| Store | `better-sqlite3` (file or `:memory:`) | **Postgres** when `DATABASE_URL=postgres://…` |
| Job queue | in-process Promise queue | **BullMQ + Redis** when `REDIS_URL=redis://…` |

The Redis (`bullmq`/`ioredis`) and Postgres (`pg`) drivers are
`optionalDependencies`, loaded lazily — the app builds and runs without them.

## Run (development)

```bash
# 1. Build the shared engine (once / when it changes)
cd packages/detector-core-ts && npm install && npm run build

# 2. API
cd apps/node-api
npm install
npm run dev            # tsx watch, http://localhost:8080
# or: npm run build && npm start

# 3. Dashboard (separate terminal)
cd apps/node-api/frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api -> :8080)
```

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the API with hot reload (`tsx watch`). |
| `npm run build` | Compile TypeScript to `dist/` (`tsc`). |
| `npm start` | Run the compiled server (`node dist/index.js`). |
| `npm run typecheck` | Type-check without emitting. |
| `npm test` | Run the vitest + supertest suite. |

## Run (Docker)

Build contexts are the **repo root** so the shared engine is available.

```bash
# API
docker build -f apps/node-api/Dockerfile -t aipd-node-api .
docker run -p 8080:8080 aipd-node-api

# Dashboard (nginx, proxies /api -> node-api:8080)
docker build -t aipd-node-frontend apps/node-api/frontend
docker run -p 8080:80 aipd-node-frontend
```

To opt into the production backends:

```bash
docker run -p 8080:8080 \
  -e DATABASE_URL=postgres://user:pw@db:5432/aipd \
  -e REDIS_URL=redis://redis:6379 \
  aipd-node-api
```

## Endpoints

All POST bodies are JSON unless noted. Every response includes a `disclaimer`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/analyze-snippet` | Analyze a single code snippet → `AnalysisResult`. |
| `POST` | `/analyze-file` | Analyze one named file → `AnalysisResult`. |
| `POST` | `/analyze-folder` | Analyze inline `{ files: {path: content} }` → `AnalysisResult`. |
| `POST` | `/analyze-repository` | Async: clone via `git` + analyze → `{ job_id, status }`. SSRF-guarded. |
| `POST` | `/analyze-zip` | Async: multipart `file` upload, zip-bomb-guarded → `{ job_id, status }`. |
| `POST` | `/reanalyze` | `{ analysis_id }` — inputs aren't retained, so returns 409 (re-submit). |
| `GET` | `/report/:id` | Full `AnalysisResult` for a completed analysis. |
| `GET` | `/analysis/:id` | `{ status, report }` if finished, else job status. |
| `GET` | `/jobs/:id` | Job status `{ id, status, kind, target, progress, error, analysis_id }`. |
| `GET` | `/history?limit=&owner=` | Recent analyses (history items). |
| `GET` | `/history/:owner` | History filtered by owner. |
| `GET` | `/repository/:owner/:repo` | Latest + history for a repo. |
| `GET` | `/detectors` | Registered detector plugins (name + description). |
| `GET` | `/healthz` | `{ status, api_version, engine_version }`. |
| `GET` | `/` | Service metadata (queue/store backend, disclaimer). |

### Async flow

1. `POST /analyze-repository` or `/analyze-zip` → `{ job_id, status: "queued" }`.
2. Poll `GET /jobs/:job_id` (or `GET /analysis/:job_id`) until `status === "finished"`.
3. Fetch `GET /report/:job_id` for the full report.

Repository / zip results are cached by `target + config` (see
`ANALYSIS_CACHE_TTL_SECONDS`); a cache hit returns `status: "finished"`
immediately.

## Environment variables

| Var | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port. |
| `DATABASE_URL` | _(unset)_ | `postgres://…` to use Postgres; otherwise SQLite. |
| `SQLITE_PATH` | `./aipd.db` | SQLite file path (when `DATABASE_URL` is unset). |
| `REDIS_URL` | _(unset)_ | `redis://…` to use BullMQ; otherwise in-process queue. |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Comma-separated allowed origins (`*` to allow all). |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-IP sliding window; `0` disables. |
| `MAX_UPLOAD_BYTES` | `104857600` (100 MiB) | Max upload (zip / folder) size. |
| `MAX_SNIPPET_BYTES` | `1048576` (1 MiB) | Max snippet/file size. |
| `MAX_REPO_FILES` | `50000` | Max files walked per repository. |
| `CLONE_TIMEOUT_SECONDS` | `600` | `git clone` timeout. |
| `ALLOW_PRIVATE_NETWORK_TARGETS` | `false` | SSRF guard toggle (allow private/loopback hosts). |
| `TOKEN_ENCRYPTION_KEY` | _(ephemeral)_ | Key for AES-256-GCM token encryption at rest. |
| `MAX_ZIP_ENTRIES` | `50000` | Zip-bomb guard: entry count cap. |
| `MAX_ZIP_UNCOMPRESSED_BYTES` | `524288000` (500 MiB) | Zip-bomb guard: total uncompressed cap. |
| `MAX_ZIP_FILE_BYTES` | `26214400` (25 MiB) | Zip-bomb guard: per-file uncompressed cap. |
| `MAX_ZIP_RATIO` | `200` | Zip-bomb guard: max uncompressed/compressed ratio. |
| `ANALYSIS_CACHE_TTL_SECONDS` | `86400` | Analysis cache TTL. |
| `WORK_DIR` | `$TMPDIR/aipd-work` | Scratch dir for clones / uploads. |

## Security

- **SSRF guard** — repo URLs are parsed and the host resolved via `dns.lookup`;
  private / loopback / link-local / unique-local addresses are rejected
  (public `github.com` is always allowed; override with
  `ALLOW_PRIVATE_NETWORK_TARGETS`).
- **Zip-bomb guard** — entry-count, per-file, total-uncompressed and
  compression-ratio caps, plus path-traversal rejection.
- **Rate limiting** — in-process per-IP sliding window.
- **Token handling** — access tokens are encrypted at rest (AES-256-GCM) and
  scrubbed from clone error output.
- **Size limits** — snippet and upload byte caps.
