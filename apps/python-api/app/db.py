"""Database engine, session factory, and ORM models."""

from __future__ import annotations

import datetime as _dt
from collections.abc import Iterator

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


class Job(Base):
    """A queued / running / finished analysis job."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    kind: Mapped[str] = mapped_column(String(32))
    target: Mapped[str] = mapped_column(Text, default="")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cache_key: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    created_at: Mapped[_dt.datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[_dt.datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    analysis: Mapped[Analysis | None] = relationship(back_populates="job", uselist=False)


class Analysis(Base):
    """A completed analysis report (full engine output stored as JSON)."""

    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    target_name: Mapped[str] = mapped_column(String(512), default="", index=True)
    owner: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    repo: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    cache_key: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)

    ai_probability: Mapped[float] = mapped_column(Float, default=0.5)
    human_probability: Mapped[float] = mapped_column(Float, default=0.5)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    classification: Mapped[str] = mapped_column(String(32), default="uncertain", index=True)

    report: Mapped[dict] = mapped_column(JSON)  # full AnalysisResult.model_dump()
    created_at: Mapped[_dt.datetime] = mapped_column(DateTime, default=_utcnow, index=True)

    job: Mapped[Job | None] = relationship(back_populates="analysis")


# --------------------------------------------------------------------------- #

_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def _make_engine():
    settings = get_settings()
    url = settings.database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True, future=True)


def init_db() -> None:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = _make_engine()
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(_engine)


def get_session() -> Iterator[Session]:
    if _SessionLocal is None:
        init_db()
    assert _SessionLocal is not None
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()


def session_scope() -> Session:
    """Get a standalone session (caller manages lifecycle). Used by workers."""
    if _SessionLocal is None:
        init_db()
    assert _SessionLocal is not None
    return _SessionLocal()
