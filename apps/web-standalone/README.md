# AI Project Detector — Standalone (browser-only) edition

A polished React + TypeScript + Tailwind + Vite single-page app that estimates how
**AI-generated** code looks — running **entirely in your browser**. There is **no
backend** and **no network call for analysis**: your code never leaves the tab.

The shared detection engine (`@aicodecheck/detector-core`) is compiled to
JavaScript and executed **off the main thread in a Web Worker**, so the UI stays
responsive even on large folders or whole repositories.

> Results are **probabilistic estimates, never proof.** They have real false-
> positive and false-negative rates and must never be used to accuse, grade, or
> penalize anyone.

## Features

- **Five input modes, all 100% client-side:**
  - **Paste a snippet** with a language selector.
  - **Choose individual files** (`<input type=file multiple>`, read via FileReader).
  - **Drag-and-drop a folder** (`webkitdirectory`), recursively read in-browser,
    skipping `node_modules` / `.git` / `dist` / `vendor` / `build` / `target`,
    lockfiles, binaries, and files larger than ~2 MB.
  - **Upload a ZIP**, extracted in-browser with [`fflate`](https://github.com/101arrowz/fflate)
    behind **zip-bomb guards** (entry-count, per-file and total-uncompressed-size
    caps) and **path-traversal safety**.
  - **GitHub repo** by `owner/repo`, `owner/repo@branch`, or full URL — fetched
    directly into the browser (codeload tarball, with a REST API + raw-contents
    fallback). Public repos only; an optional in-memory token raises rate limits.
- **Off-main-thread analysis** via a typed Web Worker client with a promise-based
  request/response bridge.
- **Rich results dashboard:** AI-probability donut gauge, classification chip,
  confidence + human-probability meters with prominent uncertainty messaging,
  top reasons, line-level evidence, recharts (classification pie, signal-breakdown
  bar), file & folder heatmaps, cross-file similarity heatmap, an SVG dependency
  graph, speculative attribution panel, recommendations, and a **Download-JSON**
  button.
- **Persistent disclaimer banner**, an **About** page (methodology + limitations),
  and a **Privacy** badge — because nothing you analyze leaves your browser.

## Why backend-free?

**Privacy.** With no server, your source code is never uploaded. Snippets, files,
folders and ZIPs are read and decompressed locally and handed straight to the
in-page Web Worker. The only optional network access is fetching *public* GitHub
source directly into your browser — the analysis itself still runs locally.

## Run / build

Prereqs: Node 22, npm 10.

```bash
# 1) Build the shared engine (the web app links it via file:).
cd packages/detector-core-ts
npm install
npm run build

# 2) Install + run the standalone app.
cd ../../apps/web-standalone
npm install
npm run dev      # local dev server (Vite)

# Production build (type-checks + bundles, incl. the Web Worker).
npm run build    # outputs static assets to ./dist
npm run preview  # preview the production build locally
```

The contents of `dist/` are fully static and can be hosted on any static host or
CDN (GitHub Pages, Netlify, Cloudflare Pages, S3, etc.). `vite.config.ts` uses
`base: "./"` so the build works from any sub-path.

## Docker (static nginx serve on port 80)

The build needs the monorepo's shared engine, so build from the **repo root**:

```bash
# from the repository root
docker build -f apps/web-standalone/Dockerfile -t ai-detector-standalone .
docker run --rm -p 8080:80 ai-detector-standalone
# open http://localhost:8080
```

## How the Web Worker is wired

- `src/worker/analyze.worker.ts` imports `analyzeSnippet` / `analyzeFiles` from
  `@aicodecheck/detector-core` and runs them inside the worker, replying via
  `postMessage`.
- `src/lib/protocol.ts` holds the shared request/response message types.
- `src/lib/engineClient.ts` lazily creates the worker with Vite's documented
  pattern and exposes promise-returning wrappers that correlate each request to
  its reply by id:

  ```ts
  new Worker(new URL("../worker/analyze.worker.ts", import.meta.url), {
    type: "module",
  });
  ```

  This pattern lets Vite bundle the worker (and the engine it imports) correctly
  for static hosting.

## GitHub fetch caveats

In-browser repo fetching is **best-effort** and works only for **public** repos.
It can be blocked by GitHub's **CORS** policy or limited by **API rate limits**.
The app tries the codeload tarball first, then falls back to the REST git/trees
API plus `raw.githubusercontent.com`. An optional **personal access token** (kept
in memory only — never persisted) raises rate limits. If a fetch fails, download
the repository ZIP from GitHub and use the **ZIP** tab. Note: **no git history is
available in the browser**, so commit-timeline and contributor signals are absent
in this edition (expected).
