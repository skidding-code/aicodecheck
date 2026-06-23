#!/usr/bin/env python3
"""Build a LARGE on-disk human-code corpus by shallow-cloning real repositories.

The committed seed set (``datasets/calibration/seed``) is intentionally small.
This script expands it on demand into ``datasets/calibration/_fetched/`` (which
is gitignored) so the corpus can scale toward ~1GB without ever committing that
data into git.

It shallow-clones (``git clone --depth 1``) a curated list of small/medium,
permissively-licensed repositories until a target on-disk size is reached. All
fetched repos are human-authored, well-known, pre-LLM-era-style codebases, so
they form a high-confidence "human" reference corpus for cross-checking the
detector.

Design goals:
  * pure standard library + ``git`` via subprocess (no third-party deps)
  * idempotent: re-running skips repos already cloned, resumes toward target
  * safe: clones into the gitignored ``_fetched`` dir only; honours --dry-run

Usage::

    python scripts/build_corpus.py                       # default 200 MB target
    python scripts/build_corpus.py --target-size-mb 1000 # ~1 GB
    python scripts/build_corpus.py --list                # show curated repos
    python scripts/build_corpus.py --clean               # remove _fetched
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
FETCH_DIR = os.path.join(REPO_ROOT, "datasets", "calibration", "_fetched")


# --------------------------------------------------------------------------- #
# Curated repos: small/medium, permissively licensed (MIT/BSD/Apache),
# human-authored, classic pre-2021-style codebases. Ordered roughly small->big
# so low targets pull the cheapest repos first. Languages are diverse on
# purpose so the resulting corpus exercises every detector path.
# --------------------------------------------------------------------------- #
class Repo:
    def __init__(self, url: str, language: str, license_name: str, approx_mb: int):
        self.url = url
        self.language = language
        self.license = license_name
        self.approx_mb = approx_mb

    @property
    def name(self) -> str:
        base = self.url.rstrip("/").rsplit("/", 1)[-1]
        return base[:-4] if base.endswith(".git") else base

    @property
    def slug(self) -> str:
        parts = self.url.rstrip("/").split("/")
        owner = parts[-2] if len(parts) >= 2 else "?"
        return f"{owner}__{self.name}"


REPOS: list[Repo] = [
    # --- tiny utils ---------------------------------------------------------
    Repo("https://github.com/sindresorhus/is-up.git", "javascript", "MIT", 1),
    Repo("https://github.com/sindresorhus/slugify.git", "javascript", "MIT", 1),
    Repo("https://github.com/sindresorhus/camelcase.git", "javascript", "MIT", 1),
    Repo("https://github.com/julienschmidt/httprouter.git", "go", "BSD-3", 1),
    Repo("https://github.com/pallets/itsdangerous.git", "python", "BSD-3", 2),
    Repo("https://github.com/psf/cachecontrol.git", "python", "Apache-2.0", 2),
    # --- small libs ---------------------------------------------------------
    Repo("https://github.com/pallets/click.git", "python", "BSD-3", 5),
    Repo("https://github.com/pallets/jinja.git", "python", "BSD-3", 8),
    Repo("https://github.com/pallets/markupsafe.git", "python", "BSD-3", 2),
    Repo("https://github.com/psf/requests.git", "python", "Apache-2.0", 10),
    Repo("https://github.com/benjaminp/six.git", "python", "MIT", 1),
    Repo("https://github.com/expressjs/express.git", "javascript", "MIT", 6),
    Repo("https://github.com/lodash/lodash.git", "javascript", "MIT", 15),
    Repo("https://github.com/chalk/chalk.git", "javascript", "MIT", 2),
    Repo("https://github.com/google/gson.git", "java", "Apache-2.0", 12),
    Repo("https://github.com/spf13/cobra.git", "go", "Apache-2.0", 10),
    Repo("https://github.com/gorilla/mux.git", "go", "BSD-3", 3),
    # --- medium libs (pull these only for larger targets) -------------------
    Repo("https://github.com/pallets/flask.git", "python", "BSD-3", 12),
    Repo("https://github.com/encode/httpx.git", "python", "BSD-3", 10),
    Repo("https://github.com/tornadoweb/tornado.git", "python", "Apache-2.0", 15),
    Repo("https://github.com/axios/axios.git", "javascript", "MIT", 12),
    Repo("https://github.com/expressjs/morgan.git", "javascript", "MIT", 2),
    Repo("https://github.com/square/okhttp.git", "java", "Apache-2.0", 40),
    Repo("https://github.com/gin-gonic/gin.git", "go", "MIT", 12),
]


# --------------------------------------------------------------------------- #
def dir_size_bytes(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def human_mb(num_bytes: int) -> str:
    return f"{num_bytes / (1024 * 1024):.1f} MB"


def git_available() -> bool:
    return shutil.which("git") is not None


def clone_repo(repo: Repo, dest_root: str, dry_run: bool) -> tuple[bool, str]:
    dest = os.path.join(dest_root, repo.slug)
    if os.path.isdir(dest):
        return True, f"skip (exists): {repo.slug}"
    if dry_run:
        return True, f"would clone: {repo.slug}  (~{repo.approx_mb} MB est.)"

    tmp = dest + ".partial"
    if os.path.isdir(tmp):
        shutil.rmtree(tmp, ignore_errors=True)
    cmd = ["git", "clone", "--depth", "1", "--quiet", repo.url, tmp]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE, timeout=600)
    except subprocess.CalledProcessError as exc:
        shutil.rmtree(tmp, ignore_errors=True)
        err = (exc.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        return False, f"FAILED: {repo.slug} ({err[-1] if err else exc})"
    except subprocess.TimeoutExpired:
        shutil.rmtree(tmp, ignore_errors=True)
        return False, f"FAILED (timeout): {repo.slug}"

    # Record provenance (pinned commit) then drop the .git dir to save space.
    sha = "unknown"
    try:
        sha = subprocess.run(["git", "-C", tmp, "rev-parse", "HEAD"],
                             check=True, capture_output=True, timeout=30
                             ).stdout.decode().strip()
    except (subprocess.SubprocessError, OSError):
        pass
    shutil.rmtree(os.path.join(tmp, ".git"), ignore_errors=True)
    with open(os.path.join(tmp, ".provenance"), "w", encoding="utf-8") as fh:
        fh.write(f"url={repo.url}\nsha={sha}\nlanguage={repo.language}\n"
                 f"license={repo.license}\nlabel=human\n")
    os.replace(tmp, dest)
    return True, f"cloned: {repo.slug} @ {sha[:10]}  ({human_mb(dir_size_bytes(dest))})"


# --------------------------------------------------------------------------- #
def cmd_list() -> int:
    print(f"{'repo':<40} {'lang':<11} {'license':<11} ~size")
    print("-" * 78)
    total = 0
    for r in REPOS:
        total += r.approx_mb
        print(f"{r.slug:<40} {r.language:<11} {r.license:<11} ~{r.approx_mb} MB")
    print("-" * 78)
    print(f"{len(REPOS)} repos, ~{total} MB if all cloned "
          "(shallow, .git removed -> usually smaller).")
    return 0


def cmd_clean() -> int:
    if os.path.isdir(FETCH_DIR):
        shutil.rmtree(FETCH_DIR)
        print(f"Removed {FETCH_DIR}")
    else:
        print(f"Nothing to remove ({FETCH_DIR} does not exist).")
    return 0


def cmd_build(target_mb: float, dry_run: bool) -> int:
    if not git_available():
        sys.stderr.write("ERROR: 'git' not found on PATH.\n")
        return 2

    os.makedirs(FETCH_DIR, exist_ok=True)
    target_bytes = int(target_mb * 1024 * 1024)
    current = dir_size_bytes(FETCH_DIR)

    print(f"Target size : {target_mb:.0f} MB")
    print(f"Output dir  : {FETCH_DIR}  (gitignored)")
    print(f"Current size: {human_mb(current)}")
    print("-" * 64)

    cloned = failed = skipped = 0
    for repo in REPOS:
        if current >= target_bytes:
            print(f"Target reached ({human_mb(current)} >= {target_mb:.0f} MB).")
            break
        ok, msg = clone_repo(repo, FETCH_DIR, dry_run)
        print(("  " + msg))
        if not ok:
            failed += 1
            continue
        if msg.startswith("skip"):
            skipped += 1
        elif msg.startswith("cloned") or msg.startswith("would clone"):
            cloned += 1
        if not dry_run:
            current = dir_size_bytes(FETCH_DIR)
    else:
        if current < target_bytes and not dry_run:
            print(f"\nNOTE: exhausted the curated repo list at {human_mb(current)} "
                  f"(< {target_mb:.0f} MB target). Add more repos to REPOS to grow "
                  "the corpus further.")

    print("-" * 64)
    print(f"cloned={cloned} skipped={skipped} failed={failed}")
    if not dry_run:
        print(f"Total on-disk corpus: {human_mb(dir_size_bytes(FETCH_DIR))}")
        print("\nAnalyze it with the engine, e.g.:")
        print(f"  python -c \"from aiprojectdetector import analyze_folder; "
              f"print(analyze_folder('{FETCH_DIR}').overall_ai_probability)\"")
    return 0 if failed == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--target-size-mb", type=float, default=200,
                   help="stop cloning once the corpus reaches this size (default: 200)")
    p.add_argument("--dry-run", action="store_true",
                   help="show what would be cloned without cloning")
    p.add_argument("--list", action="store_true", help="list curated repos and exit")
    p.add_argument("--clean", action="store_true",
                   help="delete the _fetched corpus and exit")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.list:
        return cmd_list()
    if args.clean:
        return cmd_clean()
    return cmd_build(args.target_size_mb, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
