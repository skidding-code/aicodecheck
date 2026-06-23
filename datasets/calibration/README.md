# Calibration & Benchmark Corpus

A labeled corpus for **cross-checking** the `aiprojectdetector` engine against
real human-written code and characteristic AI-style code. It is used to:

1. sanity-check that the detector scores AI-style code higher than human code
   (a *directional* check), and
2. optionally **fit a calibration profile** (`scripts/benchmark.py --fit`) that
   tunes per-signal weights from labeled data.

> **Honest disclaimer.** AI-code detection is **probabilistic, not proof**. The
> `"ai"` labels in this corpus are an **approximate stylistic proxy**: the AI
> samples are *synthetic files authored in a characteristic LLM style*, not
> verified outputs of any specific model. The `"human"` labels are
> high-confidence (verbatim source from well-known, long-lived,
> pre-LLM-era-style open-source projects) but no label here is absolute ground
> truth. Treat every result as an estimate. See
> `aiprojectdetector.models.DISCLAIMER`.

## Layout

```
datasets/calibration/
├── README.md            <- this file
├── manifest.jsonl       <- one JSON object per labeled sample (committed)
├── fitted_profile.json  <- optional, produced by benchmark.py --fit (committed)
├── seed/                <- curated, committed labeled SEED set (a few MB)
│   ├── human/           <- ~25 files copied verbatim from classic OSS repos
│   └── ai/              <- ~21 files authored in characteristic LLM style
└── _fetched/            <- LARGE on-disk corpus, GITIGNORED, built on demand
```

The seed set is small on purpose so it can live in git. The *large* corpus
(scalable toward ~1 GB) is built on demand into `_fetched/`, which is gitignored
(see the repo `.gitignore`). **Nothing under `_fetched/` is ever committed.**

## Labels

Each sample is labeled `human` or `ai`:

| label   | meaning                                                            | confidence |
|---------|-------------------------------------------------------------------|------------|
| `human` | Verbatim source from a well-known, human-maintained OSS project.  | High       |
| `ai`    | Synthetic file authored in characteristic LLM style.              | Approximate (stylistic proxy) |

### What "AI style" means here

The synthetic `ai/` samples deliberately exhibit traits commonly seen in
LLM-generated code (and described in the engine's detectors):

- verbose, fully-descriptive identifier names (`process_input_data`,
  `UserAuthenticationManager`);
- tutorial-style narration comments (`# First, we...`, `# Then we...`,
  `# Finally, we return...`);
- a docstring/JSDoc on *every* function with uniform `Args:/Returns:` sections;
- highly uniform function lengths and structure;
- a trailing placeholder `TODO: ... in a future version.`;
- glossy, emoji-laden marketing READMEs.

They are written to be *realistic*, not caricatures.

## Manifest format (`manifest.jsonl`)

One JSON object per line:

```json
{"path": "seed/human/requests__models.py", "label": "human", "language": "python", "source": "psf/requests@d64b9ad4...", "notes": "..."}
{"path": "seed/ai/user_authentication_manager.py", "label": "ai", "language": "python", "source": "synthetic/authored-in-llm-style", "notes": "..."}
```

Fields: `path` (relative to this directory), `label` (`human`|`ai`),
`language`, `source` (`owner/repo@sha` for human samples, a synthetic marker for
AI), and free-text `notes`.

## Provenance (human seed)

Human files are copied verbatim from these permissively-licensed repos at the
pinned commits recorded in `manifest.jsonl`:

| project            | license     | languages used |
|--------------------|-------------|----------------|
| pallets/click      | BSD-3       | Python         |
| psf/requests       | Apache-2.0  | Python         |
| sindresorhus/slugify, is-up | MIT | JavaScript     |
| expressjs/express  | MIT         | JavaScript     |
| julienschmidt/httprouter | BSD-3 | Go             |
| google/gson        | Apache-2.0  | Java           |

Files are flattened with a `project__name.ext` convention (e.g.
`requests__models.py`) so the seed directory stays flat and self-describing.

## Expanding the corpus

The seed set is enough for the directional check. To build a large human
reference corpus on disk:

```bash
# Activate the engine venv first:
. .venv/bin/activate

python scripts/build_corpus.py --target-size-mb 200    # default-ish
python scripts/build_corpus.py --target-size-mb 1000   # ~1 GB
python scripts/build_corpus.py --list                  # show curated repos
python scripts/build_corpus.py --clean                 # remove _fetched/
```

`build_corpus.py` shallow-clones (`git clone --depth 1`) curated
small/medium permissive repos into `_fetched/` until the target size is
reached. It is idempotent (re-runs skip existing repos) and removes each repo's
`.git` directory after recording provenance in a `.provenance` file. To grow
beyond the curated list, add entries to the `REPOS` list in that script.

## Running the benchmark

```bash
. .venv/bin/activate
python scripts/benchmark.py            # report metrics on the seed set
python scripts/benchmark.py --fit      # also fit + save fitted_profile.json
```

See `scripts/README.md` for full CLI documentation and the latest metrics.
