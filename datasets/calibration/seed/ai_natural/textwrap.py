"""Text wrapping and filling utilities."""

import re

__all__ = ["TextWrapper", "wrap", "fill", "shorten", "indent", "dedent"]

_whitespace = "\t\n\x0b\x0c\r "


class TextWrapper:
    """Wraps and fills paragraphs of text to a maximum width."""

    _whitespace_re = re.compile(r"\s+")

    # Split on whitespace runs and on hyphens within words so long words
    # can break at sensible points.
    _split_re = re.compile(
        r"(\s+|"  # whitespace
        r"[^\s\w]*\w+[^0-9\W]-(?=\w+[^0-9\W])|"  # hyphenated words
        r"(?<=[\w!\"'&.,?])-{2,}(?=\w))"
    )

    def __init__(
        self,
        width=70,
        initial_indent="",
        subsequent_indent="",
        expand_tabs=True,
        replace_whitespace=True,
        fix_sentence_endings=False,
        break_long_words=True,
        drop_whitespace=True,
        break_on_hyphens=True,
        tabsize=8,
        max_lines=None,
        placeholder=" [...]",
    ):
        self.width = width
        self.initial_indent = initial_indent
        self.subsequent_indent = subsequent_indent
        self.expand_tabs = expand_tabs
        self.replace_whitespace = replace_whitespace
        self.fix_sentence_endings = fix_sentence_endings
        self.break_long_words = break_long_words
        self.drop_whitespace = drop_whitespace
        self.break_on_hyphens = break_on_hyphens
        self.tabsize = tabsize
        self.max_lines = max_lines
        self.placeholder = placeholder

    def _munge_whitespace(self, text):
        if self.expand_tabs:
            text = text.expandtabs(self.tabsize)
        if self.replace_whitespace:
            text = text.translate({ord(c): " " for c in _whitespace})
        return text

    def _split(self, text):
        if self.break_on_hyphens:
            chunks = self._split_re.split(text)
        else:
            chunks = self._whitespace_re.split(text)
            # re-stitch so whitespace is preserved as its own chunk
            chunks = self._whitespace_re.sub(
                lambda m: "\x00" + m.group() + "\x00", text
            ).split("\x00")
        return [c for c in chunks if c]

    def _fix_sentence_endings(self, chunks):
        i = 0
        pat = re.compile(r"[a-z][\.\!\?][\"\']?\Z")
        while i < len(chunks) - 1:
            if chunks[i + 1] == " " and pat.search(chunks[i]):
                chunks[i + 1] = "  "
                i += 2
            else:
                i += 1

    def _handle_long_word(self, chunks, cur_line, cur_len, width):
        if width < 1:
            space_left = 1
        else:
            space_left = width - cur_len

        if self.break_long_words:
            chunk = chunks[-1]
            end = space_left
            if self.break_on_hyphens and len(chunk) > space_left:
                hyphen = chunk.rfind("-", 0, space_left)
                if hyphen > 0 and any(c != "-" for c in chunk[:hyphen]):
                    end = hyphen + 1
            cur_line.append(chunk[:end])
            chunks[-1] = chunk[end:]
        elif not cur_line:
            cur_line.append(chunks.pop())

    def _wrap_chunks(self, chunks):
        lines = []
        if self.width <= 0:
            raise ValueError("invalid width %r (must be > 0)" % self.width)
        if self.max_lines is not None:
            indent = (
                self.subsequent_indent if self.max_lines > 1 else self.initial_indent
            )
            if len(indent) + len(self.placeholder.lstrip()) > self.width:
                raise ValueError("placeholder too large for max width")

        chunks.reverse()

        while chunks:
            cur_line = []
            cur_len = 0

            indent = self.subsequent_indent if lines else self.initial_indent
            width = self.width - len(indent)

            if self.drop_whitespace and chunks[-1].strip() == "" and lines:
                chunks.pop()

            while chunks:
                length = len(chunks[-1])
                if cur_len + length <= width:
                    cur_line.append(chunks.pop())
                    cur_len += length
                else:
                    break

            if chunks and len(chunks[-1]) > width:
                self._handle_long_word(chunks, cur_line, cur_len, width)
                cur_len = sum(map(len, cur_line))

            if (
                self.drop_whitespace
                and cur_line
                and cur_line[-1].strip() == ""
            ):
                cur_len -= len(cur_line[-1])
                del cur_line[-1]

            if cur_line:
                if (
                    self.max_lines is None
                    or len(lines) + 1 < self.max_lines
                    or (
                        not chunks
                        or (self.drop_whitespace and len(chunks) == 1 and not chunks[0].strip())
                    )
                    and cur_len <= width
                ):
                    lines.append(indent + "".join(cur_line))
                else:
                    while cur_line:
                        if (
                            cur_line[-1].strip()
                            and cur_len + len(self.placeholder) <= width
                        ):
                            cur_line.append(self.placeholder)
                            lines.append(indent + "".join(cur_line))
                            break
                        cur_len -= len(cur_line[-1])
                        del cur_line[-1]
                    else:
                        if lines:
                            prev = lines[-1].rstrip()
                            if len(prev) + len(self.placeholder) <= self.width:
                                lines[-1] = prev + self.placeholder
                                break
                        lines.append(indent + self.placeholder.lstrip())
                    break

        return lines

    def _split_chunks(self, text):
        text = self._munge_whitespace(text)
        return self._split(text)

    def wrap(self, text):
        chunks = self._split_chunks(text)
        if self.fix_sentence_endings:
            self._fix_sentence_endings(chunks)
        return self._wrap_chunks(chunks)

    def fill(self, text):
        return "\n".join(self.wrap(text))


def wrap(text, width=70, **kwargs):
    return TextWrapper(width=width, **kwargs).wrap(text)


def fill(text, width=70, **kwargs):
    return TextWrapper(width=width, **kwargs).fill(text)


def shorten(text, width, **kwargs):
    kwargs["max_lines"] = 1
    w = TextWrapper(width=width, **kwargs)
    return w.fill(" ".join(text.split()))


def indent(text, prefix, predicate=None):
    """Add 'prefix' to the start of selected lines in 'text'."""
    if predicate is None:
        def predicate(line):
            return line.strip()

    def prefixed_lines():
        for line in text.splitlines(True):
            yield (prefix + line if predicate(line) else line)

    return "".join(prefixed_lines())


_whitespace_only_re = re.compile(r"^[ \t]+$", re.MULTILINE)
_leading_whitespace_re = re.compile(r"(^[ \t]*)(?:[^ \t\n])", re.MULTILINE)


def dedent(text):
    """Remove common leading whitespace from all lines in 'text'."""
    margin = None
    text = _whitespace_only_re.sub("", text)
    indents = _leading_whitespace_re.findall(text)
    for indent in indents:
        if margin is None:
            margin = indent
        elif indent.startswith(margin):
            pass
        elif margin.startswith(indent):
            margin = indent
        else:
            for i, (x, y) in enumerate(zip(margin, indent)):
                if x != y:
                    margin = margin[:i]
                    break

    if margin:
        for line in text.split("\n"):
            if line and not line.startswith(margin):
                raise AssertionError(
                    "inconsistent leading whitespace: %r %r" % (line, margin)
                )

    if margin:
        text = re.sub(r"(?m)^" + re.escape(margin), "", text)
    return text
