"""Recursively walk a directory tree into a list of ScannedFile objects."""

from __future__ import annotations

import os

from ..parsing.languages import (
    detect_language,
    has_binary_extension,
    is_probably_binary,
    is_probably_generated,
)
from .ignore import IgnoreRules
from .models import ScannedFile

# Per-file safety cap. Files larger than this are skipped for text analysis.
DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MiB

_DOC_NAMES = ("readme", "contributing", "changelog", "license", "code_of_conduct", "security")
_CONFIG_EXT = {".yml", ".yaml", ".toml", ".ini", ".cfg", ".json", ".env", ".conf", ".properties"}
_DEP_MANIFESTS = {
    "package.json", "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg",
    "pipfile", "cargo.toml", "go.mod", "pom.xml", "build.gradle", "gemfile",
    "composer.json", "build.sbt",
}
_CI_DIRS = (".github/workflows", ".gitlab", ".circleci", ".buildkite")
_CI_FILES = (".travis.yml", "azure-pipelines.yml", "jenkinsfile", ".gitlab-ci.yml", "bitbucket-pipelines.yml")


def classify_file(rel_path: str, language: str) -> dict[str, bool]:
    lower = rel_path.lower()
    base = os.path.basename(lower)
    name_no_ext, ext = os.path.splitext(base)
    return {
        "is_documentation": language in {"markdown", "restructuredtext"}
        or any(base.startswith(d) for d in _DOC_NAMES),
        "is_config": ext in _CONFIG_EXT or language in {"yaml", "toml", "json", "xml"},
        "is_test": "test" in lower or "spec" in lower or name_no_ext.endswith(("_test", ".test")),
        "is_ci": any(d in lower for d in _CI_DIRS) or base in _CI_FILES,
        "is_dependency_manifest": base in _DEP_MANIFESTS,
    }


def walk_directory(
    root: str,
    ignore: IgnoreRules | None = None,
    *,
    include_hidden: bool = True,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    max_files: int = 50_000,
) -> tuple[list[ScannedFile], int, int, list[str]]:
    """Return (files, skipped_count, bytes_scanned, warnings)."""
    ignore = ignore or IgnoreRules()
    files: list[ScannedFile] = []
    skipped = 0
    bytes_scanned = 0
    warnings: list[str] = []

    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, "/")
        if rel_dir == ".":
            rel_dir = ""

        # Prune ignored / hidden directories in place for efficiency.
        kept = []
        for d in dirnames:
            rel = f"{rel_dir}/{d}" if rel_dir else d
            if not include_hidden and d.startswith("."):
                continue
            if ignore.is_ignored_dir(d, rel):
                continue
            kept.append(d)
        dirnames[:] = sorted(kept)

        for fname in sorted(filenames):
            if not include_hidden and fname.startswith("."):
                skipped += 1
                continue
            rel = f"{rel_dir}/{fname}" if rel_dir else fname
            if ignore.is_ignored_file(rel):
                skipped += 1
                continue
            if has_binary_extension(rel):
                skipped += 1
                continue

            abs_path = os.path.join(dirpath, fname)
            try:
                size = os.path.getsize(abs_path)
            except OSError:
                skipped += 1
                continue
            if size == 0 or size > max_file_bytes:
                skipped += 1
                continue

            try:
                with open(abs_path, "rb") as fh:
                    raw = fh.read()
            except OSError:
                skipped += 1
                continue

            if is_probably_binary(raw):
                skipped += 1
                continue

            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")

            language = detect_language(rel, text[:512])
            cls = classify_file(rel, language)
            files.append(
                ScannedFile(
                    rel_path=rel,
                    abs_path=abs_path,
                    language=language,
                    size_bytes=size,
                    source=text,
                    is_generated=is_probably_generated(text),
                    **cls,
                )
            )
            bytes_scanned += size

            if len(files) >= max_files:
                warnings.append(
                    f"Reached max_files limit ({max_files}); remaining files were not scanned."
                )
                return files, skipped, bytes_scanned, warnings

    return files, skipped, bytes_scanned, warnings
