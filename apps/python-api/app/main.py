"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from aiprojectdetector.models import DISCLAIMER
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import analyze, health, reports

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "Probabilistic estimation of AI-generated code. "
            "**All results are estimates, never proof.** " + DISCLAIMER
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(analyze.router)
    app.include_router(reports.router)
    return app


app = create_app()
