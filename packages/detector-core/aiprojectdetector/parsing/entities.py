"""Extract code entities (functions, classes, methods) from source files.

Python uses the standard ``ast`` module for accurate boundaries. Other
languages use conservative regex heuristics that find declaration sites and
estimate body extents by brace/indent matching. The goal is "good enough"
entity boundaries for per-function stylometry, not a full compiler frontend.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field


@dataclass
class CodeEntity:
    kind: str  # "function" | "method" | "class"
    name: str
    start_line: int  # 1-based, inclusive
    end_line: int  # 1-based, inclusive
    source: str
    docstring: str | None = None
    parent: str | None = None
    decorators: list[str] = field(default_factory=list)

    @property
    def loc(self) -> int:
        return max(0, self.end_line - self.start_line + 1)


def extract_entities(source: str, language: str) -> list[CodeEntity]:
    """Dispatch to the best available extractor for ``language``."""
    if not source.strip():
        return []
    if language == "python":
        try:
            return _extract_python(source)
        except SyntaxError:
            return _extract_generic(source, language)
    if language in {
        "javascript", "typescript", "java", "kotlin", "go", "rust", "c", "cpp",
        "csharp", "swift", "scala", "php", "dart",
    }:
        return _extract_generic(source, language)
    return []


def _extract_python(source: str) -> list[CodeEntity]:
    tree = ast.parse(source)
    lines = source.split("\n")
    entities: list[CodeEntity] = []

    def end_of(node: ast.AST) -> int:
        return getattr(node, "end_lineno", None) or getattr(node, "lineno", 1)

    def visit(node: ast.AST, parent: str | None) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                start = child.lineno
                end = end_of(child)
                entities.append(
                    CodeEntity(
                        kind="method" if parent else "function",
                        name=child.name,
                        start_line=start,
                        end_line=end,
                        source="\n".join(lines[start - 1 : end]),
                        docstring=ast.get_docstring(child),
                        parent=parent,
                        decorators=[_decorator_name(d) for d in child.decorator_list],
                    )
                )
                visit(child, child.name)
            elif isinstance(child, ast.ClassDef):
                start = child.lineno
                end = end_of(child)
                entities.append(
                    CodeEntity(
                        kind="class",
                        name=child.name,
                        start_line=start,
                        end_line=end,
                        source="\n".join(lines[start - 1 : end]),
                        docstring=ast.get_docstring(child),
                        parent=parent,
                        decorators=[_decorator_name(d) for d in child.decorator_list],
                    )
                )
                visit(child, child.name)
            else:
                visit(child, parent)

    visit(tree, None)
    return entities


def _decorator_name(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:
        return ""


# Declaration patterns for C-family / common languages.
_DECL_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("class", re.compile(r"^\s*(?:export\s+|public\s+|abstract\s+|final\s+|default\s+)*"
                         r"(?:class|interface|struct|enum)\s+([A-Za-z_]\w*)")),
    ("function", re.compile(r"^\s*(?:export\s+)?(?:public\s+|private\s+|protected\s+|static\s+|"
                            r"async\s+|final\s+|override\s+)*function\s+([A-Za-z_]\w*)")),
    ("function", re.compile(r"^\s*(?:export\s+)?(?:async\s+)?def\s+([A-Za-z_]\w*)")),  # php/py-like
    ("function", re.compile(r"^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(")),  # go
    ("function", re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)")),  # rust
    ("function", re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*"
                            r"(?:async\s+)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>")),  # JS arrow fn
    ("function", re.compile(r"^\s*(?:public|private|protected|static|async|final|override|\s)+"
                            r"[A-Za-z_][\w<>\[\],\s]*\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$")),
]


def _extract_generic(source: str, language: str) -> list[CodeEntity]:
    lines = source.split("\n")
    entities: list[CodeEntity] = []
    brace_based = language not in {"python"}

    for i, line in enumerate(lines):
        for kind, pattern in _DECL_PATTERNS:
            m = pattern.match(line)
            if not m:
                continue
            name = m.group(1)
            start = i + 1
            end = _estimate_block_end(lines, i, brace_based)
            entities.append(
                CodeEntity(
                    kind=kind,
                    name=name,
                    start_line=start,
                    end_line=end,
                    source="\n".join(lines[i:end]),
                )
            )
            break
    return entities


def _estimate_block_end(lines: list[str], start_idx: int, brace_based: bool) -> int:
    """Estimate the last line of a declaration's body."""
    n = len(lines)
    if brace_based:
        depth = 0
        seen_open = False
        for j in range(start_idx, n):
            depth += lines[j].count("{") - lines[j].count("}")
            if "{" in lines[j]:
                seen_open = True
            if seen_open and depth <= 0:
                return j + 1
        return n
    # Indentation-based fallback.
    base_indent = len(lines[start_idx]) - len(lines[start_idx].lstrip())
    for j in range(start_idx + 1, n):
        if not lines[j].strip():
            continue
        indent = len(lines[j]) - len(lines[j].lstrip())
        if indent <= base_indent:
            return j
    return n
