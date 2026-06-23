"""Analysis submission endpoints."""

from __future__ import annotations

import os
import tempfile
import uuid

from aiprojectdetector import Engine
from aiprojectdetector.ingestion.loader import load_files, load_snippet
from aiprojectdetector.models import AnalysisResult
from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

from .. import jobs, tasks
from ..config import get_settings
from ..db import get_session
from ..schemas import (
    AnalyzeFileRequest,
    AnalyzeFolderRequest,
    AnalyzeRepositoryRequest,
    AnalyzeSnippetRequest,
    JobCreatedResponse,
    ReanalyzeRequest,
)
from ..security import (
    encrypt_token,
    rate_limit,
    validate_repo_reference,
    validate_snippet,
    validate_upload_size,
)
from ..storage import (
    compute_cache_key,
    create_job,
    find_cached,
    get_analysis,
    save_analysis,
)

router = APIRouter(tags=["analyze"], dependencies=[Depends(rate_limit)])

_engine = Engine()


def _new_id() -> str:
    return uuid.uuid4().hex


@router.post("/analyze-snippet", response_model=AnalysisResult)
def analyze_snippet_endpoint(
    req: AnalyzeSnippetRequest, session: Session = Depends(get_session)
) -> AnalysisResult:
    validate_snippet(req.code)
    scan = load_snippet(req.code, filename=req.filename, language=req.language)
    result = _engine.analyze(scan, analysis_id=_new_id())
    save_analysis(session, result)
    return result


@router.post("/analyze-file", response_model=AnalysisResult)
def analyze_file_endpoint(
    req: AnalyzeFileRequest, session: Session = Depends(get_session)
) -> AnalysisResult:
    validate_snippet(req.content)
    scan = load_snippet(req.content, filename=req.filename, language=req.language)
    scan.kind = "file"
    result = _engine.analyze(scan, analysis_id=_new_id())
    save_analysis(session, result)
    return result


@router.post("/analyze-folder", response_model=AnalysisResult)
def analyze_folder_endpoint(
    req: AnalyzeFolderRequest, session: Session = Depends(get_session)
) -> AnalysisResult:
    total = sum(len(c.encode("utf-8", errors="ignore")) for c in req.files.values())
    validate_upload_size(total)
    scan = load_files(req.files)
    scan.name = req.name
    result = _engine.analyze(scan, analysis_id=_new_id())
    save_analysis(session, result)
    return result


@router.post("/analyze-repository", response_model=JobCreatedResponse)
def analyze_repository_endpoint(
    req: AnalyzeRepositoryRequest, session: Session = Depends(get_session)
) -> JobCreatedResponse:
    validate_repo_reference(req.repository)
    cache_key = compute_cache_key("repository", f"{req.repository}@{req.ref}", req.config.model_dump_json())

    # Serve a cached analysis when one exists and no token is involved.
    if not req.token:
        cached = find_cached(session, cache_key)
        if cached:
            return JobCreatedResponse(
                job_id=cached.id, status="finished", message="Returned cached analysis."
            )

    job_id = _new_id()
    create_job(session, job_id=job_id, kind="repository", target=req.repository, cache_key=cache_key)
    token_enc = encrypt_token(req.token) if req.token else None
    config = req.config.to_options().__dict__

    jobs.enqueue(
        tasks.analyze_repository_task, job_id, req.repository, token_enc, config, cache_key
    )
    return JobCreatedResponse(job_id=job_id, status="queued")


@router.post("/analyze-zip", response_model=JobCreatedResponse)
async def analyze_zip_endpoint(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> JobCreatedResponse:
    settings = get_settings()
    os.makedirs(settings.work_dir, exist_ok=True)
    fd, path = tempfile.mkstemp(suffix=".zip", dir=settings.work_dir)
    size = 0
    with os.fdopen(fd, "wb") as out:
        while True:
            chunk = await file.read(1024 * 256)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.max_upload_bytes:
                out.close()
                os.remove(path)
                validate_upload_size(size)  # raises 413
            out.write(chunk)

    job_id = _new_id()
    cache_key = compute_cache_key("zip", f"{file.filename}:{size}", "{}")
    create_job(session, job_id=job_id, kind="zip", target=file.filename or "upload.zip", cache_key=cache_key)
    jobs.enqueue(tasks.analyze_zip_task, job_id, path, {}, cache_key)
    return JobCreatedResponse(job_id=job_id, status="queued")


@router.post("/reanalyze", response_model=AnalysisResult)
def reanalyze_endpoint(
    req: ReanalyzeRequest, session: Session = Depends(get_session)
) -> AnalysisResult:
    """Re-run analysis for a previously analyzed snippet/file/folder.

    Repository/zip re-analysis is best done by re-submitting (their inputs are
    not retained for privacy). For snippets/files/folders the original report's
    target is re-scored with the current engine version.
    """
    from fastapi import HTTPException

    prior = get_analysis(session, req.analysis_id)
    if not prior:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    raise HTTPException(
        status_code=409,
        detail="Re-analysis requires re-submitting the original input. Inputs are not "
        "retained after analysis for privacy and storage reasons.",
    )
