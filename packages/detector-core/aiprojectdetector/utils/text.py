"""Text and token statistics shared across detectors.

Pure functions, no I/O, easy to unit-test. These implement the actual math
behind the heuristics: Shannon entropy, n-gram repetition, compressibility,
identifier tokenization, naming-convention classification, etc.
"""

from __future__ import annotations

import math
import re
import zlib
from collections import Counter
from collections.abc import Iterable, Sequence

# A pragmatic identifier/word tokenizer for source code.
_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+|[^\sA-Za-z0-9_]")
_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{1,}")
_WORD_RE = re.compile(r"[A-Za-z']+")


def tokenize(text: str) -> list[str]:
    """Split source text into a coarse token stream (identifiers, numbers, punct)."""
    return _TOKEN_RE.findall(text)


def identifiers(text: str) -> list[str]:
    """Extract identifier-like tokens."""
    return _IDENTIFIER_RE.findall(text)


def words(text: str) -> list[str]:
    """Extract natural-language words (for prose/comment analysis)."""
    return _WORD_RE.findall(text.lower())


def shannon_entropy(items: Sequence) -> float:
    """Shannon entropy (bits) of a sequence of symbols.

    Returns 0.0 for empty/uniform input. Higher means more unpredictable.
    """
    if not items:
        return 0.0
    counts = Counter(items)
    total = len(items)
    return -sum((c / total) * math.log2(c / total) for c in counts.values())


def normalized_entropy(items: Sequence) -> float:
    """Entropy scaled to 0..1 by the maximum possible entropy for the alphabet."""
    if not items:
        return 0.0
    counts = Counter(items)
    if len(counts) <= 1:
        return 0.0
    return shannon_entropy(items) / math.log2(len(counts))


def char_entropy(text: str) -> float:
    return shannon_entropy(list(text))


def token_entropy(text: str) -> float:
    return shannon_entropy(tokenize(text))


def compressibility(text: str) -> float:
    """Ratio of compressed to original size (0..1).

    Highly repetitive text compresses well (low ratio). Used as a cheap proxy
    for boilerplate/repetition that complements n-gram analysis.
    """
    raw = text.encode("utf-8", errors="ignore")
    if not raw:
        return 1.0
    compressed = zlib.compress(raw, level=6)
    return min(1.0, len(compressed) / len(raw))


def ngrams(seq: Sequence, n: int) -> list[tuple]:
    if n <= 0 or len(seq) < n:
        return []
    return [tuple(seq[i : i + n]) for i in range(len(seq) - n + 1)]


def ngram_repetition(seq: Sequence, n: int = 3) -> float:
    """Fraction of n-grams that are duplicates (0..1).

    0 means every n-gram is unique; values near 1 mean heavy repetition.
    """
    grams = ngrams(seq, n)
    if not grams:
        return 0.0
    counts = Counter(grams)
    repeated = sum(c - 1 for c in counts.values() if c > 1)
    return repeated / len(grams)


def type_token_ratio(tokens: Sequence) -> float:
    """Vocabulary richness: unique tokens / total tokens (0..1).

    Lower values can indicate repetitive, templated text.
    """
    if not tokens:
        return 0.0
    return len(set(tokens)) / len(tokens)


def mean(values: Iterable[float]) -> float:
    vals = list(values)
    return sum(vals) / len(vals) if vals else 0.0


def stdev(values: Iterable[float]) -> float:
    vals = list(values)
    if len(vals) < 2:
        return 0.0
    m = mean(vals)
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1))


def coefficient_of_variation(values: Iterable[float]) -> float:
    """stdev / mean. Low CV => unusually uniform values (an AI tell for, e.g.,
    function lengths). Returns 0.0 when undefined."""
    vals = list(values)
    m = mean(vals)
    if m == 0:
        return 0.0
    return stdev(vals) / m


# --------------------------------------------------------------------------- #
# Naming-convention analysis                                                   #
# --------------------------------------------------------------------------- #

_SNAKE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)+$")
_CAMEL = re.compile(r"^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$")
_PASCAL = re.compile(r"^[A-Z][a-zA-Z0-9]*$")
_UPPER = re.compile(r"^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$")
_KEBAB = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)+$")


def naming_convention(name: str) -> str:
    """Classify a single identifier's naming style."""
    if _UPPER.match(name):
        return "UPPER_CASE"
    if _SNAKE.match(name):
        return "snake_case"
    if _PASCAL.match(name):
        return "PascalCase"
    if _CAMEL.match(name):
        return "camelCase"
    if _KEBAB.match(name):
        return "kebab-case"
    return "other"


def split_identifier(name: str) -> list[str]:
    """Break an identifier into component words for descriptiveness analysis."""
    name = name.strip("_")
    parts = re.split(r"[_\-]", name)
    out: list[str] = []
    for part in parts:
        # split camelCase / PascalCase boundaries
        out.extend(re.findall(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+", part) or [part])
    return [p for p in out if p]


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def logistic(x: float, k: float = 1.0, x0: float = 0.0) -> float:
    """Standard logistic squashing function, used to map raw stats to 0..1."""
    try:
        return 1.0 / (1.0 + math.exp(-k * (x - x0)))
    except OverflowError:
        return 0.0 if x < x0 else 1.0


def scale_between(value: float, low: float, high: float) -> float:
    """Linearly map ``value`` from [low, high] to [0, 1], clamped.

    If low == high returns 0.5 (no information).
    """
    if high == low:
        return 0.5
    return clamp((value - low) / (high - low))
