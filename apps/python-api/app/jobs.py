"""Job queue abstraction.

Two interchangeable backends behind one ``enqueue`` call:

* **RQ + Redis** when ``AIPD_REDIS_URL`` is set — durable, multi-worker,
  survives restarts, suitable for production.
* **In-process thread pool** otherwise — zero infrastructure, perfect for dev,
  tests and single-node use. Long-running jobs still don't block the request.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .config import get_settings

logger = logging.getLogger("aipd.jobs")

_executor: ThreadPoolExecutor | None = None
_rq_queue = None


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="aipd-job")
    return _executor


def _get_rq():
    global _rq_queue
    if _rq_queue is None:
        from redis import Redis  # noqa: PLC0415
        from rq import Queue  # noqa: PLC0415

        conn = Redis.from_url(get_settings().redis_url)
        _rq_queue = Queue("aipd", connection=conn, default_timeout=3600)
    return _rq_queue


def enqueue(func: Callable[..., Any], *args: Any) -> str:
    """Schedule ``func(*args)`` to run in the background. Returns a backend ref."""
    settings = get_settings()
    if settings.redis_url:
        job = _get_rq().enqueue(func, *args, job_timeout=settings.clone_timeout_seconds + 60)
        return job.id

    def _safe_run() -> None:
        try:
            func(*args)
        except Exception:  # noqa: BLE001
            logger.exception("Background job failed")

    _get_executor().submit(_safe_run)
    return "inprocess"


def using_redis() -> bool:
    return bool(get_settings().redis_url)
