"""Build visualization payloads and recommendations from analysis artifacts."""

from __future__ import annotations

import os
from collections import Counter

from .ingestion.models import Scan
from .models import (
    AIScore,
    Classification,
    EntityAnalysis,
    VisualizationData,
)
from .utils.text import ngrams, tokenize


def build_visualizations(
    scan: Scan,
    files: list[EntityAnalysis],
    folders: list[EntityAnalysis],
    overall: AIScore,
    signal_means: dict[str, dict[str, float]],
) -> VisualizationData:
    viz = VisualizationData()

    viz.file_heatmap = [
        {
            "path": f.path,
            "ai_probability": f.score.ai_probability,
            "confidence": f.score.confidence,
            "classification": f.score.classification.value,
            "loc": f.loc,
            "language": f.language,
        }
        for f in files
    ]

    viz.folder_heatmap = [
        {
            "path": f.path,
            "ai_probability": f.score.ai_probability,
            "confidence": f.score.confidence,
            "classification": f.score.classification.value,
            "files": int(f.score.reasons[0].split()[0]) if f.score.reasons else 0,
        }
        for f in folders
    ]

    pie = Counter(f.score.classification.value for f in files)
    viz.classification_pie = [{"label": k, "value": v} for k, v in pie.items()]

    viz.commit_timeline = [
        {
            "sha": c.sha[:10],
            "date": c.timestamp.isoformat() if c.timestamp else None,
            "insertions": c.insertions,
            "deletions": c.deletions,
            "files_changed": c.files_changed,
            "message": c.message[:80],
        }
        for c in scan.commits
    ]

    viz.contributor_activity = [
        {
            "name": c.name,
            "commits": c.commits,
            "insertions": c.insertions,
            "deletions": c.deletions,
            "first_commit": c.first_commit.isoformat() if c.first_commit else None,
            "last_commit": c.last_commit.isoformat() if c.last_commit else None,
        }
        for c in scan.contributors
    ]

    viz.signal_breakdown = [
        {
            "signal": name,
            "mean_score": round(stats["mean_score"], 4),
            "count": int(stats["count"]),
            "mean_confidence": round(stats["mean_confidence"], 4),
        }
        for name, stats in sorted(
            signal_means.items(), key=lambda kv: abs(kv[1]["mean_score"] - 0.5), reverse=True
        )
    ]

    viz.similarity_matrix = _similarity_matrix(scan)
    viz.dependency_graph = _dependency_graph(scan)
    return viz


def _similarity_matrix(scan: Scan, top_n: int = 15) -> dict:
    """Jaccard similarity of 4-gram token sets for the largest analyzable files."""
    files = sorted(scan.analyzable(), key=lambda f: f.loc, reverse=True)[:top_n]
    if len(files) < 2:
        return {}
    grams = []
    labels = []
    for f in files:
        toks = tokenize(f.source)
        grams.append(set(ngrams(toks, 4)))
        labels.append(f.rel_path)
    matrix = []
    for a in grams:
        row = []
        for b in grams:
            if not a or not b:
                row.append(0.0)
                continue
            inter = len(a & b)
            union = len(a | b)
            row.append(round(inter / union, 3) if union else 0.0)
        matrix.append(row)
    return {"labels": labels, "matrix": matrix}


def _dependency_graph(scan: Scan, max_nodes: int = 120) -> dict:
    """Lightweight intra-repo import graph for Python and JS/TS files."""
    by_module: dict[str, str] = {}
    for f in scan.analyzable():
        stem = f.rel_path.rsplit(".", 1)[0]
        by_module[stem.replace("/", ".")] = f.rel_path
        by_module[os.path.basename(stem)] = f.rel_path

    nodes = []
    edges = []
    seen = set()
    for f in scan.analyzable()[:max_nodes]:
        nodes.append({"id": f.rel_path, "language": f.language, "loc": f.loc})
        seen.add(f.rel_path)
        for imp in _imports(f.source, f.language):
            target = by_module.get(imp) or by_module.get(imp.replace("/", "."))
            if target and target != f.rel_path:
                edges.append({"source": f.rel_path, "target": target})
    edges = [e for e in edges if e["source"] in seen and e["target"] in seen]
    return {"nodes": nodes, "edges": edges}


def _imports(source: str, language: str) -> list[str]:
    import re

    out: list[str] = []
    if language == "python":
        for m in re.finditer(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", source, re.M):
            out.append((m.group(1) or m.group(2)).split(".")[0])
            if m.group(1):
                out.append(m.group(1))
    elif language in {"javascript", "typescript"}:
        for m in re.finditer(r"""(?:import[^'"]*from\s*|require\(\s*)['"]([^'"]+)['"]""", source):
            mod = m.group(1)
            if mod.startswith("."):
                out.append(os.path.normpath(mod).replace("\\", "/").lstrip("./"))
    return out


def build_recommendations(
    overall: AIScore,
    scan: Scan,
    files: list[EntityAnalysis],
) -> list[str]:
    recs: list[str] = [
        "Treat every score here as a probabilistic estimate, never as proof of AI authorship.",
    ]
    flagged = [f for f in files if f.score.ai_probability >= 0.62 and f.score.confidence >= 0.3]
    if flagged:
        top = sorted(flagged, key=lambda f: f.score.risk_score, reverse=True)[:5]
        recs.append(
            "Manually review the highest-risk files before drawing conclusions: "
            + ", ".join(f.path for f in top if f.path)
        )
    if not scan.git_available:
        recs.append(
            "No git history was available. Commit-pattern signals were skipped; "
            "providing the full repository (not just a snapshot) improves accuracy."
        )
    elif len(scan.commits) < 5:
        recs.append(
            "Very little commit history was available, which limits timeline-based signals."
        )
    if overall.confidence < 0.3:
        recs.append(
            "Overall confidence is low. The evidence is insufficient for a strong conclusion; "
            "gather more code or context before acting."
        )
    if overall.classification in {
        Classification.likely_ai_generated,
        Classification.likely_ai_assisted,
    }:
        recs.append(
            "If this assessment affects a person (e.g. academic or hiring decisions), "
            "corroborate with non-automated methods and give them a chance to respond."
        )
    return recs
