"""Shell-style filename matching with wildcards.

Supported patterns:
    *       matches everything
    ?       matches any single character
    [seq]   matches any character in seq
    [!seq]  matches any character not in seq
"""

import os
import re
from functools import lru_cache

__all__ = ["filter", "fnmatch", "fnmatchcase", "translate"]


def fnmatch(name, pattern):
    """Test whether 'name' matches 'pattern', normalizing case per OS."""
    name = os.path.normcase(name)
    pattern = os.path.normcase(pattern)
    return fnmatchcase(name, pattern)


@lru_cache(maxsize=256, typed=True)
def _compile_pattern(pattern):
    return re.compile(translate(pattern)).match


def fnmatchcase(name, pattern):
    """Test whether 'name' matches 'pattern', case-sensitively."""
    return _compile_pattern(pattern)(name) is not None


def filter(names, pattern):
    """Return the subset of 'names' that match 'pattern'."""
    result = []
    pattern = os.path.normcase(pattern)
    match = _compile_pattern(pattern)
    for name in names:
        if match(os.path.normcase(name)):
            result.append(name)
    return result


def translate(pattern):
    """Translate a shell pattern to an equivalent regular expression."""
    i, n = 0, len(pattern)
    parts = []
    while i < n:
        c = pattern[i]
        i += 1
        if c == "*":
            # Collapse consecutive stars.
            if not parts or parts[-1] != ".*":
                parts.append(".*")
        elif c == "?":
            parts.append(".")
        elif c == "[":
            j = i
            if j < n and pattern[j] == "!":
                j += 1
            if j < n and pattern[j] == "]":
                j += 1
            while j < n and pattern[j] != "]":
                j += 1
            if j >= n:
                parts.append("\\[")
            else:
                stuff = pattern[i:j]
                if "-" not in stuff:
                    stuff = stuff.replace("\\", r"\\")
                else:
                    chunks = []
                    k = i + 1 if pattern[i] == "!" else i
                    while True:
                        k = pattern.find("-", k, j)
                        if k < 0:
                            break
                        chunks.append(pattern[i:k])
                        i = k + 1
                        k = k + 3
                    chunk = pattern[i:j]
                    if chunk:
                        chunks.append(chunk)
                    else:
                        chunks[-1] += "-"
                    # Remove empty ranges left by collapsing adjacent dashes.
                    for k in range(len(chunks) - 1, 0, -1):
                        if chunks[k - 1][-1] > chunks[k][0]:
                            chunks[k - 1] = chunks[k - 1][:-1] + chunks[k][1:]
                            del chunks[k]
                    stuff = "-".join(
                        s.replace("\\", r"\\").replace("-", r"\-") for s in chunks
                    )
                stuff = re.sub(r"([&~|])", r"\\\1", stuff)
                i = j + 1
                if not stuff:
                    parts.append("(?!)")
                elif stuff == "!":
                    parts.append(".")
                else:
                    if stuff[0] == "!":
                        stuff = "^" + stuff[1:]
                    elif stuff[0] in ("^", "["):
                        stuff = "\\" + stuff
                    parts.append("[%s]" % stuff)
        else:
            parts.append(re.escape(c))

    return r"(?s:%s)\Z" % "".join(parts)
