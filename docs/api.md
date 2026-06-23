# REST API reference

Base URL (python-api): `http://localhost:8000`. Interactive docs at `/docs`
(Swagger) and `/redoc`. The Node API mirrors the same surface on port `8080`.

All responses include a `disclaimer` and treat every score as an estimate.

## Submission

### `POST /analyze-snippet`  (synchronous)
```json
{ "code": "def f(): ...", "filename": "x.py", "language": "python" }
```
→ `AnalysisResult`.

### `POST /analyze-file`  (synchronous)
```json
{ "filename": "main.py", "content": "...", "language": "python" }
```
→ `AnalysisResult`.

### `POST /analyze-folder`  (synchronous)
Inline files (e.g. drag-and-drop a folder; the client sends the contents).
```json
{ "files": { "src/a.py": "...", "src/b.py": "..." }, "name": "my-folder" }
```
→ `AnalysisResult`.

### `POST /analyze-repository`  (asynchronous)
```json
{
  "repository": "owner/repo",         // or a github.com / Enterprise URL
  "token": "ghp_...",                  // optional, for private/Enterprise
  "ref": "main",                       // optional branch/tag/commit
  "config": { "include_lockfiles": false, "analyze_git": true },
  "async_job": true
}
```
→ `{ "job_id": "...", "status": "queued" }` (or `"finished"` if served from cache).
Poll `GET /analysis/{job_id}`.

### `POST /analyze-zip`  (asynchronous, multipart)
`multipart/form-data` with field `file` = the `.zip`.
→ `{ "job_id": "...", "status": "queued" }`. Zip-bomb & path-traversal protected.

### `POST /reanalyze`
```json
{ "analysis_id": "..." }
```
Repository/zip inputs are not retained (privacy), so re-analysis requires
re-submitting the original input; the endpoint documents this explicitly.

## Retrieval

| Endpoint | Returns |
|----------|---------|
| `GET /report/{id}` | the full `AnalysisResult` |
| `GET /analysis/{id}` | `{status, progress?, error?, report?}` — report present when finished |
| `GET /jobs/{id}` | job status `{id,status,kind,target,progress,error,analysis_id}` |
| `GET /history?limit=&owner=` | recent analyses (summaries) |
| `GET /history/{owner}` | analyses for an owner |
| `GET /repository/{owner}/{repo}` | latest report + history for a repo |
| `GET /detectors` | registered detector plugins |
| `GET /healthz`, `GET /` | health + metadata |

## `AnalysisResult` (response shape)

```jsonc
{
  "id": "…",
  "target": { "kind", "name", "source", "owner", "repo", "ref",
              "languages": {"python": 12}, "total_files", "analyzed_files",
              "skipped_files", "total_loc", "bytes_scanned" },
  "overall_ai_probability": 0.0,      // 0..1, estimate
  "human_probability": 0.0,
  "classification": "uncertain",      // likely_human | possibly_ai_assisted |
                                      // likely_ai_assisted | likely_ai_generated | uncertain
  "confidence": 0.0,                  // 0..1
  "score": { "ai_probability", "human_probability", "confidence",
             "evidence_score", "risk_score", "classification", "reasons": [] },
  "files":   [ EntityAnalysis ],      // sorted by risk
  "folders": [ EntityAnalysis ],
  "functions": [ EntityAnalysis ],
  "snippets": [],
  "commit_analysis": { "available", "total_commits", "total_authors",
                       "score", "signals", "timeline", "reasons" },
  "contributor_analysis": { "available", "contributors", "reasons" },
  "attribution": [ { "source", "probability", "rationale", "confidence" } ],
  "reasons": [ "…" ],
  "evidence": [ { "detector", "signal", "message", "severity",
                  "path", "start_line", "end_line", "snippet" } ],
  "visualizations": { "folder_heatmap", "file_heatmap", "classification_pie",
                      "commit_timeline", "contributor_activity",
                      "signal_breakdown", "similarity_matrix", "dependency_graph" },
  "recommendations": [ "…" ],
  "warnings": [ "…" ],
  "elapsed_seconds": 0.0,
  "engine_version": "0.1.0",
  "disclaimer": "These results are probabilistic estimates, not proof. …",
  "generated_at": "2026-…Z"
}
```

`EntityAnalysis`:
```jsonc
{ "level": "file|folder|class|function|method|snippet",
  "identifier", "name", "language", "path", "start_line", "end_line", "loc",
  "score": { … AIScore … },
  "signals": [ { "name", "detector", "score", "weight", "confidence",
                 "reason", "evidence": [ EvidenceItem ] } ] }
```

## Errors & limits

* `400` invalid/unsafe reference (incl. SSRF guard), `404` not found,
  `409` reanalyze needs re-submission, `413` payload too large,
  `429` rate limited (with `Retry-After`).
* Configurable via `AIPD_*` env vars (see `apps/python-api/.env.example`).
