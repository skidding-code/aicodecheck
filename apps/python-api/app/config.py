"""Application configuration via environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AIPD_", env_file=".env", extra="ignore")

    # General
    app_name: str = "AI Project Detector API"
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]

    # Persistence. SQLite by default so the app runs with zero infrastructure;
    # point at Postgres in production, e.g. postgresql+psycopg://user:pw@db/aipd
    database_url: str = "sqlite:///./aipd.db"

    # Queue / cache. When set, jobs run via RQ on Redis; otherwise an in-process
    # thread pool is used (fine for dev / single-node / tests).
    redis_url: str | None = None

    # Security / limits
    rate_limit_per_minute: int = 30
    max_upload_bytes: int = 100 * 1024 * 1024  # 100 MiB
    max_repo_files: int = 50_000
    max_snippet_bytes: int = 1 * 1024 * 1024
    clone_timeout_seconds: int = 600
    allow_private_network_targets: bool = False  # SSRF guard default
    # Fernet key for encrypting access tokens at rest. Generated per-process if
    # unset (tokens then don't survive a restart — set this in production).
    token_encryption_key: str | None = None

    # Worker / job behavior
    analysis_cache_ttl_seconds: int = 24 * 3600
    work_dir: str = "/tmp/aipd-work"


@lru_cache
def get_settings() -> Settings:
    return Settings()
