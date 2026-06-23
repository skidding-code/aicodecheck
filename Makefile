.PHONY: help install test test-py lint engine-cli api frontend up down build benchmark corpus

help:
	@echo "AI Project Detector — common tasks"
	@echo "  make install     install Python engine + API (editable, with dev extras)"
	@echo "  make test        run all Python test suites"
	@echo "  make lint        ruff check the Python code"
	@echo "  make api         run the FastAPI dev server on :8000"
	@echo "  make frontend    run the React dev server on :5173"
	@echo "  make benchmark   evaluate the engine on the calibration corpus"
	@echo "  make corpus      build a large on-disk calibration corpus"
	@echo "  make up / down   docker compose up --build / down"

install:
	python -m pip install -e "packages/detector-core[all,dev]" -e "apps/python-api[dev,queue]"

test: test-py

test-py:
	cd packages/detector-core && pytest
	cd apps/python-api && pytest

lint:
	ruff check packages/detector-core apps/python-api

api:
	cd apps/python-api && uvicorn app.main:app --reload --port 8000

frontend:
	cd apps/python-api/frontend && npm install && npm run dev

benchmark:
	python scripts/benchmark.py

corpus:
	python scripts/build_corpus.py --target-size-mb 200

up:
	docker compose up --build

down:
	docker compose down -v

build:
	docker compose build
