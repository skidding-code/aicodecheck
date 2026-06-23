# Calibration & Benchmark Scripts

Two standard-library CLIs that operate on the labeled corpus in
`datasets/calibration/`. Both expect the `aiprojectdetector` engine to be
importable; activate the project venv first:

```bash
. /home/user/aicodecheck/.venv/bin/activate
# or: pip install -e packages/detector-core
```

---

## `build_corpus.py` — expand a large human-code corpus on disk

Shallow-clones curated, permissively-licensed, human-authored repositories into
`datasets/calibration/_fetched/` (which is **gitignored**) until a target
on-disk size is reached. This lets the corpus scale toward ~1 GB without ever
committing that data to git.

```bash
python scripts/build_corpus.py                       # target ~200 MB (default)
python scripts/build_corpus.py --target-size-mb 1000 # grow toward ~1 GB
python scripts/build_corpus.py --dry-run             # show what would clone
python scripts/build_corpus.py --list                # list curated repos
python scripts/build_corpus.py --clean               # delete _fetched/
```

| flag | default | meaning |
|------|---------|---------|
| `--target-size-mb` | `200` | stop cloning once `_fetched/` reaches this size |
| `--dry-run` | off | print the clone plan without cloning |
| `--list` | off | print the curated `REPOS` table and exit |
| `--clean` | off | remove the `_fetched/` directory and exit |

Behavior:

- **Shallow** clones only (`git clone --depth 1`); each repo's `.git` dir is
  removed after cloning to save space.
- **Provenance** is recorded per repo in a `.provenance` file (url, pinned sha,
  language, license, `label=human`).
- **Idempotent**: existing repos are skipped, so re-running resumes toward the
  target. Partial clones are cleaned up on failure.
- Pure standard library + `git` via `subprocess`. No third-party deps.
- To grow past the curated list, add `Repo(...)` entries to the `REPOS` list in
  the script (keep them small/medium and permissively licensed).

The whole cloned corpus can be analyzed directly:

```bash
python -c "from aiprojectdetector import analyze_folder; \
print(analyze_folder('datasets/calibration/_fetched').overall_ai_probability)"
```

---

## `benchmark.py` — score the detector against the labeled corpus

Loads `datasets/calibration/manifest.jsonl`, runs the engine on every labeled
sample (via `aiprojectdetector.analyze_snippet`), and reports separation +
classification metrics.

```bash
python scripts/benchmark.py                       # benchmark the seed set
python scripts/benchmark.py --fit                 # also fit + save a profile
python scripts/benchmark.py --threshold 0.5       # change decision threshold
python scripts/benchmark.py --json results.json   # also emit machine-readable
python scripts/benchmark.py --manifest other.jsonl
```

| flag | default | meaning |
|------|---------|---------|
| `--manifest` | seed `manifest.jsonl` | manifest to evaluate |
| `--threshold` | `0.5` | decision threshold on `ai_probability` |
| `--fit` | off | fit a `CalibrationProfile` and save it |
| `--profile-out` | `datasets/calibration/fitted_profile.json` | fit output path |
| `--json` | none | also write metrics as JSON |

Reported metrics:

- **mean `ai_probability` per class** and their **separation** (the key
  directional check: AI mean should exceed human mean);
- **accuracy / precision / recall / F1** for the `ai` class at the threshold;
- **ROC AUC** (rank-based Mann-Whitney, no sklearn needed) — the
  threshold-independent separation measure;
- per-language mean `ai_probability`;
- a `PASS`/`FAIL` directional check (exit code `3` on FAIL).

### How per-signal feature vectors are obtained

For calibration, each sample is run as a one-file snippet scan
(`analyze_snippet`). The engine returns a single file entity whose `.signals`
list is the per-file signal vector; the benchmark builds
`{signal.name: signal.score}` from the informative signals on that entity and
feeds those `(features, label)` pairs to
`aiprojectdetector.scoring.calibration.fit_profile`. The fit is an auditable
mean-separation / logistic fit (sklearn used only if installed *and* ≥20
samples), and the resulting `CalibrationProfile` is written to
`fitted_profile.json`.

> Remember: detection is probabilistic and the `ai` labels are synthetic
> stylistic proxies. See `datasets/calibration/README.md`.
