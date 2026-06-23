"""Clone repositories and extract git history metadata.

Uses the ``git`` CLI via subprocess (universally available, no heavy import).
GitPython is supported as an optional accelerator but is not required.
"""

from __future__ import annotations

import datetime as _dt
import subprocess
from dataclasses import dataclass

from ..models import CommitInfo, ContributorStat


class GitError(Exception):
    pass


@dataclass
class GitMetadata:
    available: bool
    commits: list[CommitInfo]
    contributors: list[ContributorStat]
    branches: list[str]
    tags: list[str]


def _run(args: list[str], cwd: str | None = None, timeout: int = 300) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise GitError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout


def clone_repo(
    url: str,
    dest: str,
    *,
    ref: str | None = None,
    depth: int | None = None,
    full_history: bool = True,
    timeout: int = 600,
) -> None:
    """Clone ``url`` into ``dest``.

    By default a full clone is performed so commit-history heuristics have data.
    Pass ``depth`` for a shallow clone when only the working tree is needed.
    Credentials must already be embedded in ``url`` (see github.build_clone_url).
    """
    args = ["clone"]
    if depth and not full_history:
        args += ["--depth", str(depth)]
    if ref:
        args += ["--branch", ref]
    args += [url, dest]
    try:
        _run(args, timeout=timeout)
    except subprocess.TimeoutExpired as exc:  # pragma: no cover - environment dependent
        raise GitError(f"git clone timed out after {timeout}s") from exc


def extract_metadata(root: str, max_commits: int = 5000) -> GitMetadata:
    """Read commit/contributor/branch/tag metadata from a git working tree."""
    try:
        _run(["rev-parse", "--git-dir"], cwd=root)
    except (GitError, FileNotFoundError):
        return GitMetadata(False, [], [], [], [])

    commits = _read_commits(root, max_commits)
    contributors = _aggregate_contributors(commits)
    branches = _read_refs(root, "refs/heads")
    tags = _read_refs(root, "refs/tags")
    return GitMetadata(True, commits, contributors, branches, tags)


# Record/field separators unlikely to appear in commit metadata.
_REC = "\x1e"
_FLD = "\x1f"


def _read_commits(root: str, max_commits: int) -> list[CommitInfo]:
    # The record separator must PRECEDE each commit so that, after splitting on
    # it, every block is "<header>\n<numstat...>" rather than the trailing
    # numstat of the previous commit. (Putting it at the end misaligns blocks.)
    fmt = _REC + _FLD.join(["%H", "%an", "%ae", "%aI", "%s"])
    try:
        log = _run(
            ["log", f"--max-count={max_commits}", "--no-merges", f"--pretty=format:{fmt}", "--numstat"],
            cwd=root,
        )
    except GitError:
        return []

    commits: list[CommitInfo] = []
    for block in log.split(_REC):
        block = block.strip("\n")
        if not block.strip():
            continue
        header, _, stat_text = block.partition("\n")
        parts = header.split(_FLD)
        if len(parts) < 5:
            continue
        sha, an, ae, aiso, subject = parts[:5]
        ins = dele = changed = 0
        for line in stat_text.split("\n"):
            cols = line.split("\t")
            if len(cols) == 3:
                changed += 1
                if cols[0].isdigit():
                    ins += int(cols[0])
                if cols[1].isdigit():
                    dele += int(cols[1])
        commits.append(
            CommitInfo(
                sha=sha,
                author=an,
                author_email=ae,
                timestamp=_parse_iso(aiso),
                message=subject,
                insertions=ins,
                deletions=dele,
                files_changed=changed,
            )
        )
    return commits


def _parse_iso(value: str) -> _dt.datetime | None:
    try:
        return _dt.datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _aggregate_contributors(commits: list[CommitInfo]) -> list[ContributorStat]:
    by_email: dict[str, ContributorStat] = {}
    for c in commits:
        key = c.author_email or c.author
        stat = by_email.get(key)
        if stat is None:
            stat = ContributorStat(name=c.author, email=c.author_email)
            by_email[key] = stat
        stat.commits += 1
        stat.insertions += c.insertions
        stat.deletions += c.deletions
        if c.timestamp:
            if stat.first_commit is None or c.timestamp < stat.first_commit:
                stat.first_commit = c.timestamp
            if stat.last_commit is None or c.timestamp > stat.last_commit:
                stat.last_commit = c.timestamp
    return sorted(by_email.values(), key=lambda s: s.commits, reverse=True)


def _read_refs(root: str, ref_prefix: str) -> list[str]:
    try:
        out = _run(["for-each-ref", "--format=%(refname:short)", ref_prefix], cwd=root)
    except GitError:
        return []
    return [line.strip() for line in out.split("\n") if line.strip()]
