"""Command-line interface: ``aipd <target>``.

Examples::

    aipd ./my-project                 # analyze a local folder
    aipd owner/repo                   # clone + analyze a GitHub repo
    aipd https://github.com/o/r       # same, via URL
    aipd archive.zip                  # analyze a ZIP archive
    aipd --snippet "def f(): ..."     # analyze a pasted snippet
    aipd ./proj --json report.json    # write full JSON report
"""

from __future__ import annotations

import argparse
import os
import sys

from . import Engine, load_folder, load_github, load_snippet, load_zip
from .ingestion.loader import IngestOptions
from .models import DISCLAIMER


def _emoji_bar(p: float, width: int = 24) -> str:
    filled = int(round(p * width))
    return "█" * filled + "░" * (width - filled)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="aipd", description="Estimate the likelihood that code was AI-generated (probabilistic)."
    )
    parser.add_argument("target", nargs="?", help="folder path, owner/repo, URL, or .zip file")
    parser.add_argument("--snippet", help="analyze a literal code snippet instead of a target")
    parser.add_argument("--language", help="language hint for --snippet")
    parser.add_argument("--token", help="access token for private repositories")
    parser.add_argument("--json", metavar="PATH", help="write the full JSON report to PATH")
    parser.add_argument("--include-lockfiles", action="store_true")
    parser.add_argument("--no-git", action="store_true", help="skip git-history analysis")
    parser.add_argument("--ignore", action="append", default=[], help="extra ignore glob (repeatable)")
    args = parser.parse_args(argv)

    opts = IngestOptions(
        ignore_patterns=args.ignore,
        include_lockfiles=args.include_lockfiles,
        analyze_git=not args.no_git,
    )

    try:
        if args.snippet is not None:
            scan = load_snippet(args.snippet, language=args.language)
        elif not args.target:
            parser.error("provide a target or --snippet")
        elif args.target.endswith(".zip") and os.path.isfile(args.target):
            scan = load_zip(args.target, opts)
        elif os.path.isdir(args.target):
            scan = load_folder(args.target, opts)
        else:
            scan = load_github(args.target, opts, token=args.token)
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 2

    result = Engine().analyze(scan)

    print(f"\n  Target: {result.target.name}  ({result.target.kind})")
    print(f"  Files analyzed: {result.target.analyzed_files} | LOC: {result.target.total_loc}")
    print(f"\n  AI probability   {_emoji_bar(result.overall_ai_probability)} "
          f"{result.overall_ai_probability:.0%}")
    print(f"  Confidence       {_emoji_bar(result.confidence)} {result.confidence:.0%}")
    print(f"  Classification:  {result.classification.value}")
    if result.reasons:
        print("\n  Top reasons:")
        for r in result.reasons[:6]:
            print(f"    - {r}")
    print(f"\n  {DISCLAIMER}\n")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(result.model_dump_json(indent=2))
        print(f"  Full report written to {args.json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
