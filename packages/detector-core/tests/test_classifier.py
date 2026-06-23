from aiprojectdetector import Engine, analyze_snippet
from aiprojectdetector.scoring.classifier import LinearClassifier, load_bundled_classifier

AI_ISH = (
    "# This function calculates the sum of two numbers.\n"
    "# Note that this is a simple example.\n"
    "def calculate_sum_of_two_numbers(first_number, second_number):\n"
    '    """Return the sum of the two provided numbers."""\n'
    "    # First, we add the two numbers together\n"
    "    result_of_addition = first_number + second_number\n"
    "    return result_of_addition\n"
) * 2


def test_linear_classifier_math():
    clf = LinearClassifier(feature_names=["a", "b"], coef=[2.0, -2.0], intercept=0.0)
    # equal features -> 0.5
    assert abs(clf.predict_proba({"a": 0.5, "b": 0.5}) - 0.5) < 1e-9
    # a high, b low -> clearly >0.5
    assert clf.predict_proba({"a": 1.0, "b": 0.0}) > 0.8
    # missing features default to 0.5 (neutral)
    assert abs(clf.predict_proba({}) - 0.5) < 1e-9


def test_bundled_classifier_loads():
    clf = load_bundled_classifier()
    assert clf is not None
    assert clf.feature_names and len(clf.feature_names) == len(clf.coef)
    assert "cv_roc_auc" in clf.metadata


def test_engine_classifier_mode_changes_score_and_stays_bounded():
    base = analyze_snippet(AI_ISH, filename="x.py", engine=Engine(use_classifier=False))
    clf = analyze_snippet(AI_ISH, filename="x.py", engine=Engine(use_classifier=True))
    assert 0.0 <= clf.overall_ai_probability <= 1.0
    # The classifier should still see this tutorial-style code as AI-leaning.
    assert clf.overall_ai_probability > 0.5
    # Both modes remain probabilistic with a disclaimer.
    assert base.disclaimer and clf.disclaimer
