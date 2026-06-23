"""Graceful detection of optional dependencies.

The engine must run with only ``pydantic`` and ``numpy`` installed. Optional
features (git history analysis, ML-fit calibration, tree-sitter parsing) light
up automatically when their dependencies are present and degrade silently
(with a recorded warning) when they are not.
"""

from __future__ import annotations

import importlib
import importlib.util


def has(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


HAS_GIT = has("git")  # GitPython
HAS_SKLEARN = has("sklearn")
HAS_TREE_SITTER = has("tree_sitter") and has("tree_sitter_languages")
HAS_NUMPY = has("numpy")


def require(module: str, feature: str):
    """Import ``module`` or raise a clear, actionable error."""
    if not has(module):
        raise RuntimeError(
            f"The '{feature}' feature requires the optional dependency '{module}', "
            f"which is not installed. Install it (e.g. pip install {module})."
        )
    return importlib.import_module(module)
