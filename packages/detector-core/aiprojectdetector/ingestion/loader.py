"""High-level ingestion entry points producing a ready-to-analyze ``Scan``."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field

from ..parsing.languages import detect_language
from .archive import safe_extract_zip
from .git_repo import clone_repo, extract_metadata
from .github import GitHubRef, build_clone_url, parse_reference
from .ignore import IgnoreRules
from .models import Scan, ScannedFile
from .walker import DEFAULT_MAX_FILE_BYTES, classify_file, walk_directory


class IngestionError(Exception):
    pass


@dataclass
class IngestOptions:
    ignore_patterns: list[str] = field(default_factory=list)
    include_hidden: bool = True
    include_lockfiles: bool = False
    use_default_ignores: bool = True
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES
    max_files: int = 50_000
    analyze_git: bool = True
    max_commits: int = 5000

    def ignore_rules(self) -> IgnoreRules:
        return IgnoreRules(
            self.ignore_patterns,
            include_lockfiles=self.include_lockfiles,
            use_defaults=self.use_default_ignores,
        )


def _populate_from_dir(scan: Scan, root: str, opts: IngestOptions) -> Scan:
    files, skipped, scanned, warnings = walk_directory(
        root,
        opts.ignore_rules(),
        include_hidden=opts.include_hidden,
        max_file_bytes=opts.max_file_bytes,
        max_files=opts.max_files,
    )
    scan.root = root
    scan.files = files
    scan.skipped_files = skipped
    scan.bytes_scanned = scanned
    scan.warnings.extend(warnings)

    if opts.analyze_git:
        meta = extract_metadata(root, max_commits=opts.max_commits)
        scan.git_available = meta.available
        scan.commits = meta.commits
        scan.contributors = meta.contributors
        scan.branches = meta.branches
        scan.tags = meta.tags
    return scan


def load_folder(path: str, opts: IngestOptions | None = None) -> Scan:
    opts = opts or IngestOptions()
    if not os.path.isdir(path):
        raise IngestionError(f"Not a directory: {path}")
    scan = Scan(kind="folder", name=os.path.basename(os.path.abspath(path)), source=path)
    if os.path.isdir(os.path.join(path, ".git")):
        scan.kind = "repository"
    return _populate_from_dir(scan, path, opts)


def load_zip(zip_path: str, opts: IngestOptions | None = None, *, workdir: str | None = None) -> Scan:
    opts = opts or IngestOptions()
    if not os.path.isfile(zip_path):
        raise IngestionError(f"Not a file: {zip_path}")
    dest = tempfile.mkdtemp(prefix="aipd_zip_", dir=workdir)
    safe_extract_zip(zip_path, dest)
    # If the archive contains a single top-level directory, descend into it.
    root = dest
    entries = [e for e in os.listdir(dest) if not e.startswith("__MACOSX")]
    if len(entries) == 1 and os.path.isdir(os.path.join(dest, entries[0])):
        root = os.path.join(dest, entries[0])
    scan = Scan(kind="zip", name=os.path.basename(zip_path), source=zip_path)
    return _populate_from_dir(scan, root, opts)


def load_snippet(
    code: str,
    *,
    filename: str = "snippet.txt",
    language: str | None = None,
) -> Scan:
    lang = language or detect_language(filename, code[:512])
    sf = ScannedFile(
        rel_path=filename,
        abs_path=None,
        language=lang,
        size_bytes=len(code.encode("utf-8")),
        source=code,
        **classify_file(filename, lang),
    )
    scan = Scan(kind="snippet", name=filename, source="<snippet>")
    scan.files = [sf]
    scan.bytes_scanned = sf.size_bytes
    return scan


def load_files(files: dict[str, str]) -> Scan:
    """Load a set of {relative_path: content} pairs (e.g. drag-and-drop)."""
    scan = Scan(kind="folder", name="uploaded-files", source="<files>")
    for rel, content in files.items():
        rel_norm = rel.replace("\\", "/")
        lang = detect_language(rel_norm, content[:512])
        scan.files.append(
            ScannedFile(
                rel_path=rel_norm,
                abs_path=None,
                language=lang,
                size_bytes=len(content.encode("utf-8")),
                source=content,
                **classify_file(rel_norm, lang),
            )
        )
    scan.bytes_scanned = sum(f.size_bytes for f in scan.files)
    return scan


def load_github(
    reference: str | GitHubRef,
    opts: IngestOptions | None = None,
    *,
    token: str | None = None,
    workdir: str | None = None,
) -> Scan:
    opts = opts or IngestOptions()
    ref = reference if isinstance(reference, GitHubRef) else parse_reference(reference)
    dest = tempfile.mkdtemp(prefix="aipd_clone_", dir=workdir)
    repo_dir = os.path.join(dest, ref.repo)
    url = build_clone_url(ref, token=token)
    try:
        clone_repo(
            url,
            repo_dir,
            ref=ref.ref,
            full_history=opts.analyze_git,
            depth=None if opts.analyze_git else 1,
        )
    except Exception as exc:  # noqa: BLE001 - surface a clean error to callers
        raise IngestionError(f"Failed to clone {ref.slug}: {exc}") from exc

    scan = Scan(
        kind="repository",
        name=ref.slug,
        source=f"https://{ref.host}/{ref.slug}",
        owner=ref.owner,
        repo=ref.repo,
        ref=ref.ref,
    )
    return _populate_from_dir(scan, repo_dir, opts)
