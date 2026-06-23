"""Source parsing: language detection and code-entity extraction."""

from .entities import CodeEntity, extract_entities
from .languages import (
    comment_tokens,
    detect_language,
    is_probably_binary,
    is_probably_generated,
    strip_comments,
)

__all__ = [
    "CodeEntity",
    "extract_entities",
    "detect_language",
    "comment_tokens",
    "is_probably_binary",
    "is_probably_generated",
    "strip_comments",
]
