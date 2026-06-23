from aiprojectdetector.detectors.attribution import detect_tools, estimate_attribution
from aiprojectdetector.ingestion.loader import load_files
from aiprojectdetector.models import CommitInfo


def _scan_with(files, commits=None):
    scan = load_files(files)
    if commits:
        scan.git_available = True
        scan.commits = commits
    return scan


def test_detect_cursor_from_file_marker():
    scan = _scan_with({".cursorrules": "be terse\n", "a.py": "x = 1\n"})
    tools = {g.source for g in detect_tools(scan)}
    assert "tool:cursor" in tools


def test_detect_claude_code_from_commit_signature():
    scan = _scan_with(
        {"a.py": "x = 1\n"},
        commits=[CommitInfo(sha="a" * 40, message="feat: x\n\nGenerated with Claude Code")],
    )
    g = next(x for x in detect_tools(scan) if x.source == "tool:claude_code")
    assert g.confidence >= 0.8  # commit-trailer evidence is strong


def test_no_tools_when_clean():
    assert detect_tools(_scan_with({"a.py": "x = 1\n"})) == []


def test_model_attribution_is_low_confidence_and_labeled():
    scan = _scan_with({"a.py": "# Certainly! Here's a helpful example.\nx = 1\n"})
    guesses = estimate_attribution(scan, 0.7)
    model_guesses = [g for g in guesses if g.source.startswith("model:")]
    assert model_guesses
    # Model attribution must always be low confidence and flagged speculative.
    assert all(g.confidence <= 0.2 for g in model_guesses)
    assert any("SPECULATIVE" in g.rationale for g in model_guesses)
