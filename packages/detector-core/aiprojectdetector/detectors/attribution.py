"""Highly speculative attribution of a likely generation *source*.

This is the least reliable component in the system by a wide margin. It matches
soft stylistic tendencies against per-tool profiles and returns LOW-confidence
probabilities that always sum-normalize and are gated by the overall AI
probability. Never present these as fact. They exist because the spec asks for
optional, clearly-labeled, probabilistic attribution.
"""

from __future__ import annotations

from ..constants import ATTRIBUTION_PROFILES
from ..ingestion.models import Scan
from ..models import AttributionGuess
from ..parsing.languages import strip_comments
from ..utils.text import clamp


def estimate_attribution(scan: Scan, overall_ai_probability: float) -> list[AttributionGuess]:
    # Only attempt attribution when AI authorship looks plausible at all.
    if overall_ai_probability < 0.45:
        return []

    corpus = []
    for f in scan.analyzable()[:200]:
        _, comments = strip_comments(f.source, f.language)
        corpus.append(" ".join(comments).lower())
    blob = " ".join(corpus)
    if not blob.strip():
        # No comments to go on — return a flat, maximally-hedged distribution.
        return _flat_distribution(overall_ai_probability)

    raw_scores: dict[str, float] = {}
    rationales: dict[str, str] = {}
    for key, profile in ATTRIBUTION_PROFILES.items():
        phrases = profile.get("phrases", ()) or ()
        hits = [p for p in phrases if p in blob]
        base = 0.2  # everyone gets a floor so we never claim certainty
        base += 0.15 * len(hits)
        raw_scores[key] = base
        if hits:
            rationales[key] = f"matched phrasing {', '.join(repr(h) for h in hits[:3])}"
        else:
            rationales[key] = "no distinctive phrasing matched; included for completeness"

    total = sum(raw_scores.values()) or 1.0
    guesses = []
    for key, raw in sorted(raw_scores.items(), key=lambda kv: kv[1], reverse=True):
        prob = (raw / total) * overall_ai_probability
        guesses.append(
            AttributionGuess(
                source=key,
                probability=clamp(prob),
                rationale=f"{ATTRIBUTION_PROFILES[key]['label']}: {rationales[key]}.",
                confidence=0.15,  # deliberately, permanently low
            )
        )
    return guesses


def _flat_distribution(overall_ai_probability: float) -> list[AttributionGuess]:
    keys = list(ATTRIBUTION_PROFILES.keys())
    share = overall_ai_probability / len(keys)
    return [
        AttributionGuess(
            source=k,
            probability=clamp(share),
            rationale=f"{ATTRIBUTION_PROFILES[k]['label']}: insufficient signal to differentiate.",
            confidence=0.1,
        )
        for k in keys
    ]
