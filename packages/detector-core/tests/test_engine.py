import json

from aiprojectdetector import Engine, analyze_folder, analyze_snippet
from aiprojectdetector.ingestion.loader import load_files

AI_ISH = '''
# This function calculates the sum of two numbers.
# Note that this is a simple example to demonstrate the concept.
def calculate_sum_of_two_numbers(first_number, second_number):
    """Calculate and return the sum of the two provided numbers.

    This function takes two numbers as input and returns their sum.
    """
    # First, we add the two numbers together
    result_of_addition = first_number + second_number
    # Finally, we return the result
    return result_of_addition
'''

HUMAN_ISH = '''
import sys, re
def p(x):
    m = re.match(r"(\\d+)", x)  # fixme: brittle
    return int(m.group(1)) * 2 - 1 if m else None
for l in sys.stdin:
    v = p(l.strip())
    if v and v % 3:
        print(v)
'''


def test_snippet_directionality():
    ai = analyze_snippet(AI_ISH, filename="ai.py")
    human = analyze_snippet(HUMAN_ISH, filename="human.py")
    assert ai.overall_ai_probability > human.overall_ai_probability


def test_result_is_json_serializable():
    result = analyze_snippet(AI_ISH, filename="ai.py")
    payload = json.loads(result.model_dump_json())
    assert payload["disclaimer"]
    assert "overall_ai_probability" in payload
    assert payload["classification"]


def test_result_has_disclaimer_always():
    assert analyze_snippet("x = 1\n").disclaimer


def test_folder_analysis(tmp_path):
    (tmp_path / "a.py").write_text(AI_ISH)
    (tmp_path / "b.py").write_text(HUMAN_ISH)
    result = analyze_folder(str(tmp_path))
    assert result.target.analyzed_files == 2
    assert len(result.files) == 2
    assert result.visualizations.file_heatmap


def test_engine_on_uploaded_files():
    scan = load_files({"x.py": AI_ISH, "y.py": HUMAN_ISH})
    result = Engine().analyze(scan)
    assert 0.0 <= result.overall_ai_probability <= 1.0
    assert result.id
    assert result.elapsed_seconds >= 0.0


def test_empty_input_is_safe():
    result = analyze_snippet("")
    assert result.classification.value in {"uncertain", "likely_human"}
