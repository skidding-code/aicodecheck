"""Language detection and comment handling."""

from __future__ import annotations

import os

from ..constants import (
    BINARY_EXTENSIONS,
    EXTENSION_LANGUAGE,
    GENERATED_FILE_MARKERS,
    LINE_COMMENT_TOKENS,
)

# Special filenames without informative extensions.
_FILENAME_LANGUAGE: dict[str, str] = {
    "dockerfile": "dockerfile",
    "makefile": "makefile",
    "cmakelists.txt": "cmake",
    "go.mod": "go",
    "go.sum": "go",
    "gemfile": "ruby",
    "rakefile": "ruby",
    "requirements.txt": "pip-requirements",
    "pipfile": "toml",
    "package.json": "json",
}


def detect_language(path: str, sample: str | None = None) -> str:
    """Best-effort language for a path, optionally using a content sample."""
    base = os.path.basename(path).lower()
    if base in _FILENAME_LANGUAGE:
        return _FILENAME_LANGUAGE[base]

    _, ext = os.path.splitext(base)
    if ext in EXTENSION_LANGUAGE:
        return EXTENSION_LANGUAGE[ext]

    # Shebang sniffing for extensionless scripts.
    if sample:
        first = sample.split("\n", 1)[0]
        if first.startswith("#!"):
            if "python" in first:
                return "python"
            if "node" in first:
                return "javascript"
            if any(sh in first for sh in ("bash", "sh", "zsh")):
                return "shell"
            if "ruby" in first:
                return "ruby"
    return "unknown"


def is_probably_binary(data: bytes) -> bool:
    """Heuristic binary check: NUL byte or high ratio of non-text bytes."""
    if not data:
        return False
    if b"\x00" in data[:4096]:
        return True
    sample = data[:4096]
    text_chars = bytes(range(32, 127)) + b"\n\r\t\f\b"
    nontext = sum(1 for b in sample if b not in text_chars)
    return nontext / len(sample) > 0.30


def has_binary_extension(path: str) -> bool:
    _, ext = os.path.splitext(path.lower())
    return ext in BINARY_EXTENSIONS


def is_probably_generated(sample: str) -> bool:
    """Detect machine-generated source via well-known banner markers."""
    head = sample[:2048].lower()
    return any(marker.lower() in head for marker in GENERATED_FILE_MARKERS)


def comment_tokens(language: str) -> tuple[str, ...]:
    return LINE_COMMENT_TOKENS.get(language, ("//", "#"))


def strip_comments(source: str, language: str) -> tuple[str, list[str]]:
    """Split source into (code-without-line-comments, list_of_comment_texts).

    Intentionally simple and language-agnostic: handles line comments and the
    most common block comment styles. It does not fully parse strings, so it is
    a heuristic, but it is robust and never raises.
    """
    tokens = comment_tokens(language)
    code_lines: list[str] = []
    comments: list[str] = []

    text = source
    # Block comments for C-family and docstrings for Python-family.
    if language in {
        "javascript", "typescript", "java", "kotlin", "go", "rust", "c", "cpp",
        "csharp", "swift", "scala", "php", "dart", "css", "scss",
    }:
        text, block = _extract_block_comments(text, "/*", "*/")
        comments.extend(block)

    for raw in text.split("\n"):
        line = raw
        cut = None
        for tok in tokens:
            idx = line.find(tok)
            if idx != -1 and (cut is None or idx < cut):
                cut = idx
        if cut is not None:
            comment = line[cut:].lstrip("#/-* \t")
            if comment:
                comments.append(comment)
            line = line[:cut]
        code_lines.append(line)

    return "\n".join(code_lines), comments


def _extract_block_comments(text: str, open_tok: str, close_tok: str) -> tuple[str, list[str]]:
    comments: list[str] = []
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        start = text.find(open_tok, i)
        if start == -1:
            out.append(text[i:])
            break
        out.append(text[i:start])
        end = text.find(close_tok, start + len(open_tok))
        if end == -1:
            comments.append(text[start + len(open_tok):])
            break
        comments.append(text[start + len(open_tok):end])
        i = end + len(close_tok)
    return "".join(out), comments
