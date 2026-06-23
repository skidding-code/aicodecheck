"""RQ worker entrypoint (used only when AIPD_REDIS_URL is configured).

Run with: ``python -m app.worker``
"""

from __future__ import annotations

from .config import get_settings
from .db import init_db


def main() -> None:
    settings = get_settings()
    if not settings.redis_url:
        raise SystemExit("AIPD_REDIS_URL is not set; no Redis-backed queue to serve.")
    from redis import Redis
    from rq import Queue, Worker

    init_db()
    conn = Redis.from_url(settings.redis_url)
    worker = Worker([Queue("aipd", connection=conn)], connection=conn)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
