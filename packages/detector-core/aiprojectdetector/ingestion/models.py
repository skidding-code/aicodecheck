"""In-memory representation of an ingested target."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..models import CommitInfo, ContributorStat


@dataclass
class ScannedFile:
    """A single text file selected for analysis."""

    rel_path: str  # path relative to the scan root, POSIX-style
    abs_path: str | None
    language: str
    size_bytes: int
    source: str  # decoded text content
    is_generated: bool = False
    is_documentation: bool = False
    is_config: bool = False
    is_test: bool = False
    is_ci: bool = False
    is_dependency_manifest: bool = False

    @property
    def loc(self) -> int:
        return self.source.count("\n") + 1 if self.source else 0


@dataclass
class Scan:
    """Everything ingested from one target, ready to be analyzed."""

    kind: str  # repository | folder | zip | file | snippet
    name: str
    source: str  # url / path / "<snippet>"
    root: str | None = None
    files: list[ScannedFile] = field(default_factory=list)

    # Optional metadata.
    owner: str | None = None
    repo: str | None = None
    ref: str | None = None
    git_available: bool = False
    commits: list[CommitInfo] = field(default_factory=list)
    contributors: list[ContributorStat] = field(default_factory=list)
    branches: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)

    skipped_files: int = 0
    bytes_scanned: int = 0
    warnings: list[str] = field(default_factory=list)

    def languages(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for f in self.files:
            out[f.language] = out.get(f.language, 0) + 1
        return dict(sorted(out.items(), key=lambda kv: kv[1], reverse=True))

    def total_loc(self) -> int:
        return sum(f.loc for f in self.files)

    def analyzable(self) -> list[ScannedFile]:
        """Files suitable for stylometry (excludes generated/binary-ish)."""
        return [f for f in self.files if not f.is_generated and f.source.strip()]
