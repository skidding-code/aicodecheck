from aiprojectdetector.parsing import detect_language, extract_entities, strip_comments


def test_detect_language():
    assert detect_language("a/b/main.py") == "python"
    assert detect_language("x.tsx") == "typescript"
    assert detect_language("Dockerfile") == "dockerfile"
    assert detect_language("script", "#!/usr/bin/env python3\n") == "python"


def test_extract_python_entities():
    src = (
        "class Foo:\n"
        "    def method_a(self):\n"
        "        return 1\n"
        "\n"
        "def top_level():\n"
        "    return 2\n"
    )
    ents = extract_entities(src, "python")
    kinds = {(e.kind, e.name) for e in ents}
    assert ("class", "Foo") in kinds
    assert ("method", "method_a") in kinds
    assert ("function", "top_level") in kinds


def test_extract_python_handles_syntax_error():
    # Falls back to generic extractor instead of raising.
    ents = extract_entities("def broken(:\n  pass", "python")
    assert isinstance(ents, list)


def test_extract_generic_js():
    src = "export function doThing(a, b) {\n  return a + b;\n}\n"
    ents = extract_entities(src, "javascript")
    assert any(e.name == "doThing" for e in ents)


def test_strip_comments_python():
    code, comments = strip_comments("x = 1  # set x\n# standalone\ny = 2\n", "python")
    assert "set x" in " ".join(comments)
    assert "standalone" in " ".join(comments)
    assert "#" not in code


def test_strip_comments_block():
    code, comments = strip_comments("/* hello */\nconst a = 1; // trailing\n", "javascript")
    joined = " ".join(comments)
    assert "hello" in joined
    assert "trailing" in joined
