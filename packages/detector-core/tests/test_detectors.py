from aiprojectdetector.detectors import (
    AuthorshipArtifactsDetector,
    DocumentationDetector,
    LLMFingerprintDetector,
    StructureDetector,
)
from aiprojectdetector.detectors.base import AnalysisUnit


def _unit(source, language="python", kind="file", **kw):
    return AnalysisUnit(source=source, language=language, path="x", kind=kind, name="x", **kw)


def test_llm_fingerprint_flags_generic_comments():
    src = (
        "# This function calculates the result.\n"
        "# Note that this is an example.\n"
        "# First, we initialize the value.\n"
        "def f(value_to_process):\n"
        "    # Here we process the value\n"
        "    processed_value = value_to_process + 1\n"
        "    # Finally, we return the result\n"
        "    return processed_value\n"
    )
    signals = {s.name: s for s in LLMFingerprintDetector().unit_signals(_unit(src))}
    assert "generic_comments" in signals
    assert signals["generic_comments"].score > 0.55


def test_llm_fingerprint_flags_placeholder():
    src = "def f():\n    # TODO: implement\n    raise NotImplementedError\n" * 1
    signals = {s.name: s for s in LLMFingerprintDetector().unit_signals(_unit(src + "x=1\n" * 6))}
    assert "placeholder_implementations" in signals


def test_documentation_detects_marketing():
    readme = (
        "# My Project\n\n"
        "This project is designed to harness the power of cutting-edge tech.\n"
        "It is a robust and scalable, comprehensive solution.\n\n"
        "## Features\n- one\n- two\n- three\n\n## Installation\n## Usage\n## Contributing\n## License\n"
    )
    signals = {s.name: s for s in DocumentationDetector().unit_signals(_unit(readme, "markdown", is_documentation=True))}
    assert "chatbot_wording" in signals
    assert signals["chatbot_wording"].score > 0.5


def test_structure_repetition_directionality():
    repetitive = _unit("\n".join(f"value_{i} = compute(value_{i})" for i in range(40)))
    varied = _unit(
        "import os\nx = os.getpid() ^ 7\nif x % 3:\n    y = [i*i for i in range(x)]\nelse:\n    y = None\nprint(y, x)\n"
    )
    det = StructureDetector()
    rep_signals = {s.name: s for s in det.unit_signals(repetitive)}
    var_signals = {s.name: s for s in det.unit_signals(varied)}
    if "repetitive_patterns" in rep_signals and "repetitive_patterns" in var_signals:
        assert rep_signals["repetitive_patterns"].score >= var_signals["repetitive_patterns"].score


def test_authorship_comment_polish_flags_polished_comments():
    src = (
        "def process(data):\n"
        "    # This function processes the incoming data and returns a result.\n"
        "    # It first validates the input before doing any work.\n"
        "    # Finally, it returns the computed value to the caller.\n"
        "    # Note that the input must be a non-empty list of numbers.\n"
        "    total = 0\n"
        "    count = 0\n"
        "    for value in data:\n"
        "        total += value\n"
        "        count += 1\n"
        "    average = total / count if count else 0\n"
        "    return total, average, count\n"
    )
    sigs = {s.name: s for s in AuthorshipArtifactsDetector().unit_signals(
        AnalysisUnit(source=src, language="python", path="x.py", kind="file", name="x"))}
    assert "comment_polish" in sigs
    assert sigs["comment_polish"].score > 0.6


def test_authorship_missing_artifacts_repo_signal():
    from aiprojectdetector.ingestion.loader import load_files

    # Code with zero TODO/FIXME/noqa across enough lines -> leans AI.
    clean = "\n".join(f"def f{i}(x):\n    return x * {i} + 1\n" for i in range(40))
    scan = load_files({"m.py": clean})
    sigs = {s.name: s for s in AuthorshipArtifactsDetector().repo_signals(scan, [])}
    assert "missing_human_artifacts" in sigs
    assert sigs["missing_human_artifacts"].score > 0.5  # absence leans AI

    # Same code WITH human artifacts -> leans human.
    messy = clean + "\n# TODO: handle the zero case\n# FIXME: this is a hack\nx = 1  # noqa\n"
    scan2 = load_files({"m.py": messy})
    sigs2 = {s.name: s for s in AuthorshipArtifactsDetector().repo_signals(scan2, [])}
    assert sigs2["missing_human_artifacts"].score < sigs["missing_human_artifacts"].score


def test_structure_uniform_function_lengths_repo_signal():
    from aiprojectdetector.ingestion.models import Scan

    units = [
        AnalysisUnit(source="\n".join(["x = 1"] * 5), language="python", path=f"f{i}.py",
                     kind="function", name=f"fn{i}")
        for i in range(12)
    ]
    signals = {s.name: s for s in StructureDetector().repo_signals(Scan(kind="folder", name="t", source="."), units)}
    assert "uniform_function_lengths" in signals
    # 12 identical-length functions => high uniformity => leans AI
    assert signals["uniform_function_lengths"].score > 0.6
