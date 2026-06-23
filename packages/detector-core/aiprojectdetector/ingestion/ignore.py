"""gitignore-style ignore rules plus the engine's built-in default excludes."""

from __future__ import annotations

import fnmatch
import os

from ..constants import DEFAULT_IGNORE_DIRS, DEFAULT_LOCKFILES


class IgnoreRules:
    """Match paths against default excludes + user-supplied glob patterns.

    Supports a practical subset of .gitignore semantics: directory names,
    glob patterns, and negation with a leading ``!``. Patterns are matched
    against POSIX-style relative paths and their basenames.
    """

    def __init__(
        self,
        patterns: list[str] | None = None,
        *,
        include_lockfiles: bool = False,
        use_defaults: bool = True,
    ) -> None:
        self.use_defaults = use_defaults
        self.include_lockfiles = include_lockfiles
        self.positive: list[str] = []
        self.negative: list[str] = []
        for raw in patterns or []:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("!"):
                self.negative.append(line[1:].strip())
            else:
                self.positive.append(line)

    @classmethod
    def from_gitignore_text(cls, text: str, **kwargs) -> IgnoreRules:
        return cls(text.split("\n"), **kwargs)

    def _matches_globs(self, rel_path: str, patterns: list[str]) -> bool:
        base = os.path.basename(rel_path)
        for pat in patterns:
            p = pat.rstrip("/")
            if fnmatch.fnmatch(rel_path, p) or fnmatch.fnmatch(base, p):
                return True
            # directory-prefix match, e.g. "src/generated"
            if rel_path == p or rel_path.startswith(p + "/"):
                return True
        return False

    def is_ignored_dir(self, name: str, rel_path: str) -> bool:
        if self.use_defaults and name in DEFAULT_IGNORE_DIRS:
            return True
        if self._matches_globs(rel_path, self.positive) and not self._matches_globs(
            rel_path, self.negative
        ):
            return True
        return False

    def is_ignored_file(self, rel_path: str) -> bool:
        base = os.path.basename(rel_path)
        if not self.include_lockfiles and base in DEFAULT_LOCKFILES:
            return True
        if self._matches_globs(rel_path, self.negative):
            return False
        if self._matches_globs(rel_path, self.positive):
            return True
        # ignore if any parent dir is a default-ignored dir
        if self.use_defaults:
            parts = rel_path.split("/")
            if any(part in DEFAULT_IGNORE_DIRS for part in parts[:-1]):
                return True
        return False
