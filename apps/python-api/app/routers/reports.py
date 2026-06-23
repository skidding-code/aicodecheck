"""Report retrieval, job status, history, and repository lookup endpoints."""

from __future__ import annotations

from aiprojectdetector.detectors import registered
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import HistoryItem, JobResponse
from ..storage import (
    find_repository_analyses,
    get_analysis,
    get_job,
    list_history,
)

router = APIRouter(tags=["reports"])


def _full_report(session: Session, analysis_id: str) -> dict:
    analysis = get_analysis(session, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Report not found.")
    return analysis.report


@router.get("/report/{analysis_id}")
def get_report(analysis_id: str, session: Session = Depends(get_session)) -> dict:
    return _full_report(session, analysis_id)


@router.get("/analysis/{analysis_id}")
def get_analysis_or_job(analysis_id: str, session: Session = Depends(get_session)) -> dict:
    """Return the full report if ready, otherwise the job's current status."""
    analysis = get_analysis(session, analysis_id)
    if analysis:
        return {"status": "finished", "report": analysis.report}
    job = get_job(session, analysis_id)
    if job:
        return {
            "status": job.status,
            "progress": job.progress,
            "error": job.error,
            "report": None,
        }
    raise HTTPException(status_code=404, detail="No analysis or job with that id.")


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job_status(job_id: str, session: Session = Depends(get_session)) -> JobResponse:
    job = get_job(session, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    analysis = get_analysis(session, job_id)
    return JobResponse(
        id=job.id,
        status=job.status,
        kind=job.kind,
        target=job.target,
        progress=job.progress,
        error=job.error,
        analysis_id=analysis.id if analysis else None,
    )


@router.get("/history", response_model=list[HistoryItem])
def get_history(
    limit: int = Query(50, ge=1, le=200),
    owner: str | None = None,
    session: Session = Depends(get_session),
) -> list[HistoryItem]:
    rows = list_history(session, limit=limit, owner=owner)
    return [_to_history_item(a) for a in rows]


@router.get("/history/{owner}", response_model=list[HistoryItem])
def get_history_for_owner(
    owner: str, limit: int = Query(50, ge=1, le=200), session: Session = Depends(get_session)
) -> list[HistoryItem]:
    rows = list_history(session, limit=limit, owner=owner)
    return [_to_history_item(a) for a in rows]


@router.get("/repository/{owner}/{repo}")
def get_repository(owner: str, repo: str, session: Session = Depends(get_session)) -> dict:
    rows = find_repository_analyses(session, owner, repo)
    if not rows:
        raise HTTPException(status_code=404, detail="No analyses for that repository yet.")
    latest = rows[0]
    return {
        "owner": owner,
        "repo": repo,
        "latest": latest.report,
        "history": [_to_history_item(a).model_dump() for a in rows],
    }


@router.get("/detectors")
def list_detectors() -> dict:
    """Expose the registered detector plugins (for transparency / UI)."""
    return {
        "detectors": [
            {"name": name, "description": cls.description}
            for name, cls in registered().items()
        ]
    }


def _to_history_item(a) -> HistoryItem:
    return HistoryItem(
        id=a.id,
        kind=a.kind,
        target_name=a.target_name,
        classification=a.classification,
        ai_probability=a.ai_probability,
        confidence=a.confidence,
        created_at=a.created_at.isoformat(),
    )
