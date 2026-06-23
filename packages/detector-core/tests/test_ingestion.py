import zipfile

import pytest

from aiprojectdetector.ingestion import IgnoreRules, ZipBombError, safe_extract_zip
from aiprojectdetector.ingestion.archive import ZipLimits
from aiprojectdetector.ingestion.github import build_clone_url, parse_reference
from aiprojectdetector.ingestion.loader import load_files, load_folder, load_snippet


def test_ignore_defaults():
    rules = IgnoreRules()
    assert rules.is_ignored_dir("node_modules", "node_modules")
    assert rules.is_ignored_file("a/node_modules/x.js")
    assert rules.is_ignored_file("package-lock.json")
    assert not rules.is_ignored_file("src/main.py")


def test_ignore_lockfiles_opt_in():
    assert not IgnoreRules(include_lockfiles=True).is_ignored_file("package-lock.json")


def test_ignore_custom_and_negation():
    rules = IgnoreRules(["*.log", "secret/", "!keep.log"])
    assert rules.is_ignored_file("debug.log")
    assert not rules.is_ignored_file("keep.log")


def test_parse_reference_variants():
    assert parse_reference("owner/repo").slug == "owner/repo"
    r = parse_reference("https://github.com/o/r/tree/dev")
    assert r.owner == "o" and r.repo == "r" and r.ref == "dev"
    g = parse_reference("git@github.com:o/r.git")
    assert g.slug == "o/r"


def test_build_clone_url_embeds_token():
    ref = parse_reference("o/r")
    url = build_clone_url(ref, token="secrettoken")
    assert "x-access-token:secrettoken@github.com/o/r.git" in url


def test_zip_normal_extract(tmp_path):
    zpath = tmp_path / "a.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("hello.py", "print('hi')\n")
        zf.writestr("sub/world.txt", "data")
    dest = tmp_path / "out"
    count = safe_extract_zip(str(zpath), str(dest))
    assert count == 2
    assert (dest / "hello.py").exists()


def test_zip_path_traversal_blocked(tmp_path):
    zpath = tmp_path / "evil.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("../escape.txt", "x")
    with pytest.raises(ZipBombError):
        safe_extract_zip(str(zpath), str(tmp_path / "out"))


def test_zip_bomb_ratio_blocked(tmp_path):
    zpath = tmp_path / "bomb.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("big.txt", "0" * (5 * 1024 * 1024))  # compresses extremely well
    limits = ZipLimits(max_compression_ratio=50.0)
    with pytest.raises(ZipBombError):
        safe_extract_zip(str(zpath), str(tmp_path / "out"), limits)


def test_load_snippet():
    scan = load_snippet("def f():\n    return 1\n", filename="f.py")
    assert scan.kind == "snippet"
    assert scan.files[0].language == "python"


def test_load_files():
    scan = load_files({"a.py": "x = 1\n", "b.js": "const y = 2;\n"})
    langs = scan.languages()
    assert "python" in langs and "javascript" in langs


def test_load_folder(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("def main():\n    return 0\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "junk.js").write_text("module.exports = 1;\n")
    scan = load_folder(str(tmp_path))
    paths = {f.rel_path for f in scan.files}
    assert "src/main.py" in paths
    assert not any("node_modules" in p for p in paths)
