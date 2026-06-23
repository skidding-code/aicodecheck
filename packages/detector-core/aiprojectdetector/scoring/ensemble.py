"""Combine detector signals into a calibrated, explainable AIScore."""

from __future__ import annotations

from ..models import AIScore, Classification, Signal
from ..utils.text import clamp, logistic, mean, stdev
from .calibration import DEFAULT_PROFILE, CalibrationProfile


def classify(ai_probability: float, confidence: float, profile: CalibrationProfile) -> Classification:
    """Map (probability, confidence) to a hedged classification bucket."""
    if confidence < profile.min_confidence:
        return Classification.uncertain
    if ai_probability >= profile.t_generated:
        return Classification.likely_ai_generated
    if ai_probability >= profile.t_assisted_high:
        return Classification.likely_ai_assisted
    if ai_probability >= profile.t_assisted_low:
        return Classification.possibly_ai_assisted
    if ai_probability <= profile.t_human:
        return Classification.likely_human
    return Classification.uncertain


def combine_signals(
    signals: list[Signal],
    profile: CalibrationProfile | None = None,
    *,
    max_reasons: int = 6,
) -> AIScore:
    """Aggregate signals into an AIScore.

    Aggregation is a confidence-and-weight-weighted average of each signal's
    deviation from neutral (0.5). Confidence reflects both the total amount of
    evidence and how much the signals *agree*; when signals disagree we report
    lower confidence rather than a falsely precise number.
    """
    profile = profile or DEFAULT_PROFILE
    informative = [s for s in signals if s.informative]
    if not informative:
        return AIScore(
            ai_probability=0.5,
            human_probability=0.5,
            confidence=0.0,
            evidence_score=0.0,
            risk_score=0.0,
            classification=Classification.uncertain,
            reasons=["Not enough signal to form an estimate."],
        )

    eff_weights: list[float] = []
    deviations: list[float] = []
    for s in informative:
        mult = profile.weight_overrides.get(s.name, 1.0)
        ew = s.weight * s.confidence * mult
        eff_weights.append(ew)
        deviations.append(s.score - 0.5)

    total_w = sum(eff_weights) or 1e-9
    weighted_dev = sum(w * d for w, d in zip(eff_weights, deviations, strict=False)) / total_w
    ai_probability = clamp(0.5 + weighted_dev * profile.gain)
    human_probability = clamp(1.0 - ai_probability)

    # Confidence: more total weight -> higher; more disagreement -> lower.
    volume = logistic(total_w, k=0.6, x0=4.0)  # ~0.5 at total_w=4
    agreement = 1.0 - clamp(stdev(deviations) / 0.3) if len(deviations) > 1 else 0.6
    confidence = clamp(volume * (0.5 + 0.5 * agreement))

    # Evidence score: amount + strength of concrete evidence items.
    ev_items = [e for s in informative for e in s.evidence]
    ev_strength = mean([e.severity for e in ev_items]) if ev_items else 0.0
    evidence_score = clamp(logistic(len(ev_items), k=0.5, x0=3.0) * (0.4 + 0.6 * ev_strength))

    risk_score = clamp(ai_probability * confidence)
    classification = classify(ai_probability, confidence, profile)
    reasons = _top_reasons(informative, eff_weights, deviations, max_reasons)

    return AIScore(
        ai_probability=round(ai_probability, 4),
        human_probability=round(human_probability, 4),
        confidence=round(confidence, 4),
        evidence_score=round(evidence_score, 4),
        risk_score=round(risk_score, 4),
        classification=classification,
        reasons=reasons,
    )


def _top_reasons(
    signals: list[Signal],
    eff_weights: list[float],
    deviations: list[float],
    limit: int,
) -> list[str]:
    ranked = sorted(
        zip(signals, eff_weights, deviations, strict=False),
        key=lambda t: t[1] * abs(t[2]),
        reverse=True,
    )
    reasons: list[str] = []
    for s, _w, dev in ranked:
        if not s.reason:
            continue
        lean = "leans AI" if dev > 0 else "leans human"
        reasons.append(f"[{s.name}, {lean}] {s.reason}")
        if len(reasons) >= limit:
            break
    return reasons
