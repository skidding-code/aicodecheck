from aiprojectdetector.detectors import (
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
