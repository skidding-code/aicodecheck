"""Request/response schemas for the REST API."""

from __future__ import annotations

from aiprojectdetector.ingestion.loader import IngestOptions  # noqa: F401 (re-export convenience)
from pydantic import BaseModel, Field


class IngestConfig(BaseModel):
    """Subset of ingestion options exposed over the API."""

    ignore_patterns: list[str] = Field(default_factory=list)
    include_hidden: bool = True
    include_lockfiles: bool = False
    analyze_git: bool = True
    max_files: int = 50_000

    def to_options(self) -> IngestOptions:
        return IngestOptions(
            ignore_patterns=self.ignore_patterns,
            include_hidden=self.include_hidden,
            include_lockfiles=self.include_lockfiles,
            analyze_git=self.analyze_git,
            max_files=self.max_files,
        )


class AnalyzeRepositoryRequest(BaseModel):
    repository: str = Field(description="URL or owner/repo (github.com or Enterprise).")
    token: str | None = Field(default=None, description="PAT for private/Enterprise repos.")
    ref: str | None = None
    config: IngestConfig = Field(default_factory=IngestConfig)
    async_job: bool = Field(default=True, description="Queue as a background job.")


class AnalyzeFolderRequest(BaseModel):
    """Analyze a set of files supplied inline (drag-and-drop folder)."""

    files: dict[str, str] = Field(description="Mapping of relative path -> file content.")
    name: str = "uploaded-folder"
    config: IngestConfig = Field(default_factory=IngestConfig)


class AnalyzeSnippetRequest(BaseModel):
    code: str
    filename: str = "snippet.txt"
    language: str | None = None


class AnalyzeFileRequest(BaseModel):
    filename: str
    content: str
    language: str | None = None


class ReanalyzeRequest(BaseModel):
    analysis_id: str


class JobResponse(BaseModel):
    id: str
    status: str
    kind: str
    target: str
    progress: float
    error: str | None = None
    analysis_id: str | None = None


class JobCreatedResponse(BaseModel):
    job_id: str
    status: str
    message: str = "Analysis queued. Poll GET /jobs/{job_id} or GET /analysis/{job_id}."


class HistoryItem(BaseModel):
    id: str
    kind: str
    target_name: str
    classification: str
    ai_probability: float
    confidence: float
    created_at: str
