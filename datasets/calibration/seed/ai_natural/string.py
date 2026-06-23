"""Common string operations and constants."""

ascii_lowercase = "abcdefghijklmnopqrstuvwxyz"
ascii_uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
ascii_letters = ascii_lowercase + ascii_uppercase
digits = "0123456789"
hexdigits = digits + "abcdef" + "ABCDEF"
octdigits = "01234567"
punctuation = r"""!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~"""
whitespace = " \t\n\r\v\f"
printable = digits + ascii_letters + punctuation + whitespace


def capwords(s, sep=None):
    """Split on whitespace (or sep), capitalize each word, and rejoin."""
    return (sep or " ").join(w.capitalize() for w in s.split(sep))


class Template:
    """A string class for $-based substitution."""

    delimiter = "$"
    idpattern = r"(?a:[_a-z][_a-z0-9]*)"
    braceidpattern = None
    flags = None

    def __init__(self, template):
        self.template = template

    def _compile(self):
        import re

        delim = re.escape(self.delimiter)
        idpattern = self.idpattern
        braceidpattern = self.braceidpattern or idpattern
        flags = re.IGNORECASE if self.flags is None else self.flags
        pattern = r"""
            %(delim)s(?:
              (?P<escaped>%(delim)s) |
              (?P<named>%(id)s)      |
              {(?P<braced>%(bid)s)}  |
              (?P<invalid>)
            )
        """ % {
            "delim": delim,
            "id": idpattern,
            "bid": braceidpattern,
        }
        return re.compile(pattern, flags | re.VERBOSE)

    def _invalid(self, mo):
        i = mo.start("invalid")
        lines = self.template[:i].splitlines(keepends=True)
        if not lines:
            colno = 1
            lineno = 1
        else:
            colno = i - len("".join(lines[:-1]))
            lineno = len(lines)
        raise ValueError(
            "Invalid placeholder in string: line %d, col %d" % (lineno, colno)
        )

    def substitute(self, mapping=None, /, **kws):
        if mapping is None:
            mapping = kws
        elif kws:
            mapping = {**mapping, **kws}

        def convert(mo):
            named = mo.group("named") or mo.group("braced")
            if named is not None:
                return str(mapping[named])
            if mo.group("escaped") is not None:
                return self.delimiter
            if mo.group("invalid") is not None:
                self._invalid(mo)
            raise ValueError("Unrecognized named group in pattern")

        return self._compile().sub(convert, self.template)

    def safe_substitute(self, mapping=None, /, **kws):
        if mapping is None:
            mapping = kws
        elif kws:
            mapping = {**mapping, **kws}

        def convert(mo):
            named = mo.group("named") or mo.group("braced")
            if named is not None:
                try:
                    return str(mapping[named])
                except KeyError:
                    return mo.group()
            if mo.group("escaped") is not None:
                return self.delimiter
            if mo.group("invalid") is not None:
                return mo.group()
            raise ValueError("Unrecognized named group in pattern")

        return self._compile().sub(convert, self.template)

    def is_valid(self):
        for mo in self._compile().finditer(self.template):
            if mo.group("invalid") is not None:
                return False
        return True

    def get_identifiers(self):
        ids = []
        for mo in self._compile().finditer(self.template):
            named = mo.group("named") or mo.group("braced")
            if named is not None and named not in ids:
                ids.append(named)
            elif named is None and mo.group("invalid") is not None:
                self._invalid(mo)
        return ids
