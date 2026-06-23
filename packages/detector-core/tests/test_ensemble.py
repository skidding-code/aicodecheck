from aiprojectdetector.models import Classification, Signal
from aiprojectdetector.scoring import DEFAULT_PROFILE, classify, combine_signals


def test_empty_signals_are_uncertain():
    score = combine_signals([])
    assert score.classification == Classification.uncertain
    assert score.ai_probability == 0.5
    assert score.confidence == 0.0


def test_strong_agreement_raises_probability():
    signals = [
        Signal(name=f"s{i}", detector="d", score=0.85, weight=1.0, confidence=0.9, reason="r")
        for i in range(6)
    ]
    score = combine_signals(signals)
    assert score.ai_probability > 0.6
    assert score.confidence > 0.4
    assert score.human_probability == round(1 - score.ai_probability, 4)


def test_disagreement_lowers_confidence():
    agree = [Signal(name=f"a{i}", detector="d", score=0.8, weight=1, confidence=0.9) for i in range(6)]
    disagree = [
        Signal(name=f"d{i}", detector="d", score=0.9 if i % 2 else 0.1, weight=1, confidence=0.9)
        for i in range(6)
    ]
    assert combine_signals(agree).confidence > combine_signals(disagree).confidence


def test_classify_thresholds():
    p = DEFAULT_PROFILE
    assert classify(0.9, 0.8, p) == Classification.likely_ai_generated
    assert classify(0.55, 0.8, p) == Classification.possibly_ai_assisted
    assert classify(0.3, 0.8, p) == Classification.likely_human
    # Low confidence always yields uncertain regardless of probability.
    assert classify(0.95, 0.1, p) == Classification.uncertain


def test_risk_score_is_prob_times_confidence():
    signals = [Signal(name=f"s{i}", detector="d", score=0.8, weight=1, confidence=0.9) for i in range(5)]
    score = combine_signals(signals)
    assert abs(score.risk_score - round(score.ai_probability * score.confidence, 4)) < 1e-3
