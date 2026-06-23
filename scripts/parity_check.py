#!/usr/bin/env python3
"""Cross-engine parity check: Python engine vs TypeScript engine.

Runs both engines over the labeled calibration corpus (or any files passed on
the command line) and reports how closely their probability estimates agree.
This guards the TypeScript port against drift from the canonical Python engine.

Usage:
    python scripts/parity_check.py                 # use datasets/calibration
    python scripts/parity_check.py path1 path2 ... # use explicit files

Requires:
    * the Python package installed (pip install -e packages/detector-core)
    * the TS engine built (cd packages/detector-core-ts && npm i && npm run build)
    * node on PATH
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS_DIST = ROOT / "packages" / "detector-core-ts" / "dist" / "index.js"
MANIFEST = ROOT / "datasets" / "calibration" / "manifest.jsonl"
SEED_DIR = ROOT / "datasets" / "calibration"

# A tiny Node program that reads {path: code} JSON on stdin and prints
# {path: ai_probability} JSON on stdout.
_NODE_SCRIPT = """
import { analyzeSnippet } from %s;
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const files = JSON.parse(raw);
  const out = {};
  for (const [p, code] of Object.entries(files)) {
    const r = analyzeSnippet(code, { filename: p });
    out[p] = r.overall_ai_probability;
  }
  process.stdout.write(JSON.stringify(out));
});
"""


def _gather_files(args: list[str]) -> dict[str, str]:
    files: dict[str, str] = {}
    if args:
        for a in args:
            p = Path(a)
            if p.is_file():
                files[str(p)] = p.read_text(encoding="utf-8", errors="replace")
        return files
    if not MANIFEST.exists():
        print(f"No manifest at {MANIFEST}; pass files explicitly.", file=sys.stderr)
        sys.exit(2)
    for line in MANIFEST.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        fp = SEED_DIR / rec["path"]
        if fp.exists():
            files[rec["path"]] = fp.read_text(encoding="utf-8", errors="replace")
    return files


def _python_scores(files: dict[str, str]) -> dict[str, float]:
    from aiprojectdetector import analyze_snippet  # noqa: PLC0415

    return {
        p: round(analyze_snippet(code, filename=Path(p).name).overall_ai_probability, 6)
        for p, code in files.items()
    }


def _ts_scores(files: dict[str, str]) -> dict[str, float]:
    if not TS_DIST.exists():
        print(f"TS engine not built at {TS_DIST}. Run: "
              f"cd packages/detector-core-ts && npm i && npm run build", file=sys.stderr)
        sys.exit(2)
    script = _NODE_SCRIPT % json.dumps(str(TS_DIST))
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(files),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print("node failed:\n" + proc.stderr, file=sys.stderr)
        sys.exit(2)
    return json.loads(proc.stdout)


def main(argv: list[str]) -> int:
    files = _gather_files(argv)
    if not files:
        print("No files to compare.", file=sys.stderr)
        return 2
    py = _python_scores(files)
    ts = _ts_scores(files)

    diffs = []
    worst: list[tuple[float, str, float, float]] = []
    for p in files:
        a, b = py.get(p, 0.5), ts.get(p, 0.5)
        d = abs(a - b)
        diffs.append(d)
        worst.append((d, p, a, b))
    worst.sort(reverse=True)
    mean_d = sum(diffs) / len(diffs)
    max_d = max(diffs)

    print("=" * 64)
    print(f"Cross-engine parity over {len(files)} files")
    print("=" * 64)
    print(f"  mean |Δ ai_probability| : {mean_d:.4f}")
    print(f"  max  |Δ ai_probability| : {max_d:.4f}")
    print("  largest divergences:")
    for d, p, a, b in worst[:8]:
        print(f"    {d:.4f}  py={a:.3f} ts={b:.3f}  {p}")
    # A faithful port should agree to within a small tolerance.
    tol = 0.05
    ok = max_d <= tol
    print("-" * 64)
    print(f"  RESULT: {'PASS' if ok else 'FAIL'} (tolerance {tol} on max divergence)")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
