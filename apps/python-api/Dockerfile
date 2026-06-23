# Build context must be the repo ROOT so the shared engine is available:
#   docker build -f apps/python-api/Dockerfile -t aipd-python-api .
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# git is required to clone repositories for analysis.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the shared engine first (better layer caching).
COPY packages/detector-core /app/packages/detector-core
RUN pip install "/app/packages/detector-core[all]"

# Install the API.
COPY apps/python-api /app/apps/python-api
RUN pip install "/app/apps/python-api[postgres,queue]"

WORKDIR /app/apps/python-api

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/aipd-work \
    && chown -R appuser /tmp/aipd-work
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
