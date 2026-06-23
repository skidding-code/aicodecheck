"""Health and metadata endpoints."""

from __future__ import annotations

from aiprojectdetector import __version__ as engine_version
from aiprojectdetector.models import DISCLAIMER
from fastapi import APIRouter

from .. import __version__ as api_version
from ..jobs import using_redis

router = APIRouter(tags=["meta"])


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "api_version": api_version, "engine_version": engine_version}


@router.get("/")
def root() -> dict:
    return {
        "name": "AI Project Detector API",
        "api_version": api_version,
        "engine_version": engine_version,
        "queue": "redis" if using_redis() else "in-process",
        "disclaimer": DISCLAIMER,
        "docs": "/docs",
    }
