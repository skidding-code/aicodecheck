"""Persistence helpers: jobs, analyses, history, and the analysis cache."""

from __future__ import annotations

import hashlib

from aiprojectdetector.models import AnalysisResult
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Analysis, Job


def compute_cache_key(kind: str, target: str, config_repr: str) -> str:
    raw = f"{kind}|{target}|{config_repr}".encode()
    return hashlib.sha256(raw).hexdigest()[:32]


def create_job(session: Session, *, job_id: str, kind: str, target: str, cache_key: str | None) -> Job:
    job = Job(id=job_id, kind=kind, target=target, status="queued", cache_key=cache_key)
    session.add(job)
    session.commit()
    return job


def update_job(
    session: Session,
    job_id: str,
    *,
    status: str | None = None,
    progress: float | None = None,
    error: str | None = None,
) -> None:
    job = session.get(Job, job_id)
    if not job:
        return
    if status is not None:
        job.status = status
    if progress is not None:
        job.progress = progress
    if error is not None:
        job.error = error
    session.commit()


def get_job(session: Session, job_id: str) -> Job | None:
    return session.get(Job, job_id)


def save_analysis(
    session: Session,
    result: AnalysisResult,
    *,
    job_id: str | None = None,
    cache_key: str | None = None,
) -> Analysis:
    payload = result.model_dump(mode="json")
    analysis = Analysis(
        id=result.id,
        job_id=job_id,
        kind=result.target.kind,
        target_name=result.target.name,
        owner=result.target.owner,
        repo=result.target.repo,
        cache_key=cache_key,
        ai_probability=result.overall_ai_probability,
        human_probability=result.human_probability,
        confidence=result.confidence,
        classification=result.classification.value,
        report=payload,
    )
    session.merge(analysis)
    session.commit()
    return analysis


def get_analysis(session: Session, analysis_id: str) -> Analysis | None:
    return session.get(Analysis, analysis_id)


def find_cached(session: Session, cache_key: str) -> Analysis | None:
    stmt = (
        select(Analysis)
        .where(Analysis.cache_key == cache_key)
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    return session.execute(stmt).scalar_one_or_none()


def list_history(session: Session, *, limit: int = 50, owner: str | None = None) -> list[Analysis]:
    stmt = select(Analysis).order_by(Analysis.created_at.desc()).limit(limit)
    if owner:
        stmt = stmt.where(Analysis.owner == owner)
    return list(session.execute(stmt).scalars().all())


def find_repository_analyses(session: Session, owner: str, repo: str) -> list[Analysis]:
    stmt = (
        select(Analysis)
        .where(Analysis.owner == owner, Analysis.repo == repo)
        .order_by(Analysis.created_at.desc())
    )
    return list(session.execute(stmt).scalars().all())
