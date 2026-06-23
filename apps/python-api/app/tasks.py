"""Analysis tasks executed by the job queue (RQ worker or thread pool).

These are module-level functions with serializable arguments so they can be
enqueued by RQ. They each manage their own DB session and update job state.
"""

from __future__ import annotations

import os
import traceback

from aiprojectdetector import Engine
from aiprojectdetector.ingestion.loader import IngestOptions, load_files, load_github, load_zip

from .config import get_settings
from .db import session_scope
from .storage import save_analysis, update_job


def _opts(config: dict) -> IngestOptions:
    return IngestOptions(
        ignore_patterns=config.get("ignore_patterns", []),
        include_hidden=config.get("include_hidden", True),
        include_lockfiles=config.get("include_lockfiles", False),
        analyze_git=config.get("analyze_git", True),
        max_files=config.get("max_files", 50_000),
    )


def analyze_repository_task(
    job_id: str,
    reference: str,
    token_encrypted: str | None,
    config: dict,
    cache_key: str | None,
) -> str:
    settings = get_settings()
    os.makedirs(settings.work_dir, exist_ok=True)
    session = session_scope()
    try:
        update_job(session, job_id, status="running", progress=0.1)
        token = None
        if token_encrypted:
            from .security import decrypt_token

            token = decrypt_token(token_encrypted)
        scan = load_github(reference, _opts(config), token=token, workdir=settings.work_dir)
        update_job(session, job_id, progress=0.6)
        result = Engine().analyze(scan, analysis_id=job_id)
        save_analysis(session, result, job_id=job_id, cache_key=cache_key)
        update_job(session, job_id, status="finished", progress=1.0)
        return job_id
    except Exception as exc:  # noqa: BLE001
        update_job(session, job_id, status="failed", error=f"{exc}\n{traceback.format_exc()[:2000]}")
        raise
    finally:
        session.close()


def analyze_zip_task(job_id: str, zip_path: str, config: dict, cache_key: str | None) -> str:
    settings = get_settings()
    session = session_scope()
    try:
        update_job(session, job_id, status="running", progress=0.1)
        scan = load_zip(zip_path, _opts(config), workdir=settings.work_dir)
        update_job(session, job_id, progress=0.6)
        result = Engine().analyze(scan, analysis_id=job_id)
        save_analysis(session, result, job_id=job_id, cache_key=cache_key)
        update_job(session, job_id, status="finished", progress=1.0)
        return job_id
    except Exception as exc:  # noqa: BLE001
        update_job(session, job_id, status="failed", error=f"{exc}\n{traceback.format_exc()[:2000]}")
        raise
    finally:
        try:
            os.remove(zip_path)
        except OSError:
            pass
        session.close()


def analyze_files_task(job_id: str, files: dict, name: str, config: dict, cache_key: str | None) -> str:
    session = session_scope()
    try:
        update_job(session, job_id, status="running", progress=0.2)
        scan = load_files(files)
        scan.name = name
        result = Engine().analyze(scan, analysis_id=job_id)
        save_analysis(session, result, job_id=job_id, cache_key=cache_key)
        update_job(session, job_id, status="finished", progress=1.0)
        return job_id
    except Exception as exc:  # noqa: BLE001
        update_job(session, job_id, status="failed", error=str(exc))
        raise
    finally:
        session.close()
