# Contributing

Thanks for your interest in improving AI Project Detector.

## Ground rules

1. **Never claim certainty.** Any change that presents a score as definitive
   proof of AI authorship will be rejected. Outputs are probabilistic estimates
   with confidence and evidence. `uncertain` is a valid result.
2. **Explainability is required.** A signal that moves a score must attach a
   human-readable `reason` and, where possible, concrete `EvidenceItem`s.
3. **Keep the two engines in parity.** The Python engine
   (`packages/detector-core`) is canonical; the TypeScript engine
   (`packages/detector-core-ts`) must mirror its behavior. Run the parity check.

## Dev setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e "packages/detector-core[all,dev]" -e "apps/python-api[dev,queue]"
( cd packages/detector-core-ts && npm install && npm run build )
```

## Before opening a PR

```bash
# Python
ruff check packages/detector-core apps/python-api
( cd packages/detector-core && pytest )
( cd apps/python-api && pytest )

# TypeScript engine
( cd packages/detector-core-ts && npm run typecheck && npm test )

# Cross-engine agreement (must PASS)
python scripts/parity_check.py

# Detector quality on the calibration corpus (separation must stay positive)
python scripts/benchmark.py
```

## Adding a detector

1. Subclass `Detector` (Python) and/or implement the equivalent in TS.
2. Implement `unit_signals` and/or `repo_signals`; emit calibrated `Signal`s
   (0.5 = neutral) with reasons/evidence. Prefer **two-sided** signals so clean
   human code can vote "human".
3. Register it (`detectors.register`). Add tests. Re-run the benchmark and note
   the effect on separation/AUC in your PR.

## Calibration changes

If you change signal math or weights, re-run `scripts/benchmark.py` and include
before/after metrics. Be honest about confounds (formatters, linters, language
coverage) in code comments and docs.
