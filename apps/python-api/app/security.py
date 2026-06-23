"""Security utilities: rate limiting, token encryption, SSRF & input guards."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from aiprojectdetector.ingestion.github import is_safe_host, parse_reference
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request, status

from .config import get_settings

# --------------------------------------------------------------------------- #
# Rate limiting (sliding-window, in-process). For multi-node deployments swap   #
# this for a Redis-backed limiter; the interface stays the same.               #
# --------------------------------------------------------------------------- #

_WINDOW = 60.0
_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def rate_limit(request: Request) -> None:
    limit = get_settings().rate_limit_per_minute
    if limit <= 0:
        return
    client = request.client.host if request.client else "unknown"
    now = time.time()
    with _lock:
        bucket = _hits[client]
        while bucket and now - bucket[0] > _WINDOW:
            bucket.popleft()
        if len(bucket) >= limit:
            retry = int(_WINDOW - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded ({limit}/min). Retry in ~{retry}s.",
                headers={"Retry-After": str(retry)},
            )
        bucket.append(now)


# --------------------------------------------------------------------------- #
# Token encryption at rest                                                      #
# --------------------------------------------------------------------------- #

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = get_settings().token_encryption_key
        _fernet = Fernet(key.encode() if key else Fernet.generate_key())
    return _fernet


def encrypt_token(token: str) -> str:
    return _get_fernet().encrypt(token.encode()).decode()


def decrypt_token(blob: str) -> str:
    try:
        return _get_fernet().decrypt(blob.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(status_code=400, detail="Invalid encrypted token.") from exc


# --------------------------------------------------------------------------- #
# SSRF / input validation                                                      #
# --------------------------------------------------------------------------- #


def validate_repo_reference(reference: str) -> None:
    """Reject references whose host resolves to private/loopback ranges."""
    settings = get_settings()
    try:
        ref = parse_reference(reference)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    host = ref.host.split("/")[0]
    if host in {"github.com", "www.github.com"}:
        return  # public GitHub is always allowed
    if not is_safe_host(host, allow_private=settings.allow_private_network_targets):
        raise HTTPException(
            status_code=400,
            detail=f"Refusing to clone from host {host!r}: it resolves to a disallowed "
            f"(private/loopback) address or could not be verified.",
        )


def validate_upload_size(size: int) -> None:
    limit = get_settings().max_upload_bytes
    if size > limit:
        raise HTTPException(
            status_code=413, detail=f"Upload exceeds limit ({limit} bytes)."
        )


def validate_snippet(code: str) -> None:
    limit = get_settings().max_snippet_bytes
    if len(code.encode("utf-8", errors="ignore")) > limit:
        raise HTTPException(status_code=413, detail=f"Snippet exceeds {limit} bytes.")
