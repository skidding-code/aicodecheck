"""Attribution: which AI *tool* (real, evidence-based) and which *model* (weak).

Two very different reliability tiers:

1. **Tool markers (real evidence).** Files like ``.cursorrules`` or
   ``.github/copilot-instructions.md``, and commit trailers like
   "Generated with Claude Code", genuinely indicate a specific tool was used.
   These are reported with meaningful confidence.

2. **Model-family attribution (speculative).** Guessing whether code came from
   Claude vs GPT vs Gemini vs GLM from the code alone is *not* reliably
   possible. These guesses are returned only at very low confidence, gated by
   the overall AI probability, and must never be presented as fact.
"""

from __future__ import annotations

from ..constants import (
    AI_TOOL_COMMIT_SIGNATURES,
    AI_TOOL_FILE_MARKERS,
    ATTRIBUTION_PROFILES,
)
from ..ingestion.models import Scan
from ..models import AttributionGuess
from ..parsing.languages import strip_comments
from ..utils.text import clamp


def detect_tools(scan: Scan) -> list[AttributionGuess]:
    """Detect AI coding tools from concrete artifacts (real evidence)."""
    paths = [f.rel_path.lower() for f in scan.files]
    guesses: list[AttributionGuess] = []

    for tool, markers in AI_TOOL_FILE_MARKERS.items():
        hits = [m for m in markers if any(m in p for p in paths)]
        # A bare "components/ui/" or "supabase/" is weak on its own; explicit
        # rule/config files are strong.
        strong = [h for h in hits if h.endswith((".md", ".json", ".yml", ".nix", "rules", "/")) and
                  not h.endswith(("ui/",))]
        if not hits:
            continue
        conf = 0.85 if strong else 0.4
        guesses.append(
            AttributionGuess(
                source=f"tool:{tool}",
                probability=clamp(0.7 if strong else 0.45),
                rationale=f"Found {tool} artifact(s): {', '.join(hits)}.",
                confidence=conf,
            )
        )

    if scan.git_available and scan.commits:
        blob = "\n".join(c.message.lower() for c in scan.commits)
        for tool, sigs in AI_TOOL_COMMIT_SIGNATURES.items():
            matched = [s for s in sigs if s in blob]
            if matched:
                guesses.append(
                    AttributionGuess(
                        source=f"tool:{tool}",
                        probability=0.85,
                        rationale=f"Commit messages contain {tool} signature(s): "
                        f"{', '.join(repr(m) for m in matched)}.",
                        confidence=0.9,
                    )
                )

    # Deduplicate by source, keeping the highest-confidence guess.
    best: dict[str, AttributionGuess] = {}
    for g in guesses:
        if g.source not in best or g.confidence > best[g.source].confidence:
            best[g.source] = g
    return sorted(best.values(), key=lambda g: g.confidence, reverse=True)


def estimate_attribution(scan: Scan, overall_ai_probability: float) -> list[AttributionGuess]:
    # Tool detection is evidence-based and always runs.
    results = detect_tools(scan)

    # Model-family guessing only when AI authorship looks plausible at all, and
    # always at low confidence.
    if overall_ai_probability >= 0.45:
        results.extend(_guess_model_family(scan, overall_ai_probability))
    return results


def _guess_model_family(scan: Scan, overall_ai_probability: float) -> list[AttributionGuess]:
    corpus = []
    for f in scan.analyzable()[:200]:
        _, comments = strip_comments(f.source, f.language)
        corpus.append(" ".join(comments).lower())
    blob = " ".join(corpus)

    raw: dict[str, float] = {}
    rationale: dict[str, str] = {}
    for key, profile in ATTRIBUTION_PROFILES.items():
        phrases = profile.get("phrases", ()) or ()
        hits = [p for p in phrases if p in blob]
        raw[key] = 0.2 + 0.15 * len(hits)
        rationale[key] = (
            f"matched phrasing {', '.join(repr(h) for h in hits[:3])}"
            if hits
            else "no distinctive phrasing matched"
        )

    total = sum(raw.values()) or 1.0
    out = []
    for key, score in sorted(raw.items(), key=lambda kv: kv[1], reverse=True):
        out.append(
            AttributionGuess(
                source=f"model:{key}",
                probability=clamp((score / total) * overall_ai_probability),
                rationale=f"{ATTRIBUTION_PROFILES[key]['label']}: {rationale[key]} "
                f"(SPECULATIVE — model attribution from code is not reliable).",
                confidence=0.12,  # deliberately, permanently low
            )
        )
    return out
