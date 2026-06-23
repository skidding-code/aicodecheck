"""A lexical analyzer class for simple shell-like syntaxes."""

import os
import re
from io import StringIO

__all__ = ["Lexer", "split", "join", "quote"]


class Lexer:
    """A lexical analyzer for shell-like word splitting."""

    def __init__(self, instream=None, posix=False, punctuation_chars=False):
        if isinstance(instream, str):
            instream = StringIO(instream)
        self.instream = instream
        self.posix = posix
        self.eof = None if posix else ""

        self.commenters = "#"
        self.wordchars = (
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
        )
        if posix:
            self.wordchars += (
                "ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþ"
                "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ"
            )
        self.whitespace = " \t\r\n"
        self.whitespace_split = False
        self.quotes = "'\""
        self.escape = "\\"
        self.escapedquotes = '"'

        if not punctuation_chars:
            punctuation_chars = ""
        elif punctuation_chars is True:
            punctuation_chars = "();<>|&"
        self._punctuation_chars = punctuation_chars
        if punctuation_chars:
            self._pushback_chars = []
            self.wordchars += "~-./*?="
            self.wordchars = "".join(
                c for c in self.wordchars if c not in punctuation_chars
            )

        self.state = " "
        self.pushback = []
        self.token = ""

    @property
    def punctuation_chars(self):
        return self._punctuation_chars

    def push_token(self, tok):
        self.pushback.insert(0, tok)

    def get_token(self):
        if self.pushback:
            return self.pushback.pop(0)
        raw = self.read_token()
        return raw

    def read_token(self):
        quoted = False
        escapedstate = " "
        while True:
            if self.punctuation_chars and self._pushback_chars:
                nextchar = self._pushback_chars.pop()
            else:
                nextchar = self.instream.read(1)

            if self.state is None:
                self.token = ""
                break
            elif self.state == " ":
                if not nextchar:
                    self.state = None
                    break
                elif nextchar in self.whitespace:
                    if self.token or (self.posix and quoted):
                        break
                    continue
                elif nextchar in self.commenters:
                    self.instream.readline()
                elif self.posix and nextchar in self.escape:
                    escapedstate = "a"
                    self.state = nextchar
                elif nextchar in self.wordchars:
                    self.token = nextchar
                    self.state = "a"
                elif nextchar in self.punctuation_chars:
                    self.token = nextchar
                    self.state = "c"
                elif nextchar in self.quotes:
                    if not self.posix:
                        self.token = nextchar
                    self.state = nextchar
                elif self.whitespace_split:
                    self.token = nextchar
                    self.state = "a"
                else:
                    self.token = nextchar
                    if self.token or (self.posix and quoted):
                        break
                    continue
            elif self.state in self.quotes:
                quoted = True
                if not nextchar:
                    raise ValueError("No closing quotation")
                if nextchar == self.state:
                    if not self.posix:
                        self.token += nextchar
                        self.state = " "
                        break
                    else:
                        self.state = "a"
                elif (
                    self.posix
                    and nextchar in self.escape
                    and self.state in self.escapedquotes
                ):
                    escapedstate = self.state
                    self.state = nextchar
                else:
                    self.token += nextchar
            elif self.state in self.escape:
                if not nextchar:
                    raise ValueError("No escaped character")
                if (
                    escapedstate in self.quotes
                    and nextchar != self.state
                    and nextchar != escapedstate
                ):
                    self.token += self.state
                self.token += nextchar
                self.state = escapedstate
            elif self.state in ("a", "c"):
                if not nextchar:
                    self.state = None
                    break
                elif nextchar in self.whitespace:
                    self.state = " "
                    if self.token or (self.posix and quoted):
                        break
                    continue
                elif nextchar in self.commenters:
                    self.instream.readline()
                    if self.posix:
                        self.state = " "
                        if self.token or (self.posix and quoted):
                            break
                        continue
                elif self.state == "c":
                    if nextchar in self.punctuation_chars:
                        self.token += nextchar
                    else:
                        if nextchar not in self.whitespace:
                            self._pushback_chars.append(nextchar)
                        self.state = " "
                        break
                elif self.posix and nextchar in self.quotes:
                    self.state = nextchar
                elif self.posix and nextchar in self.escape:
                    escapedstate = "a"
                    self.state = nextchar
                elif (
                    nextchar in self.wordchars
                    or nextchar in self.quotes
                    or (self.whitespace_split and nextchar not in self.punctuation_chars)
                ):
                    self.token += nextchar
                else:
                    if self.punctuation_chars:
                        self._pushback_chars.append(nextchar)
                    else:
                        self.pushback.insert(0, nextchar)
                    self.state = " "
                    if self.token or (self.posix and quoted):
                        break
                    continue

        result = self.token
        self.token = ""
        if self.posix and not quoted and result == "":
            result = None
        return result

    def __iter__(self):
        return self

    def __next__(self):
        token = self.get_token()
        if token == self.eof:
            raise StopIteration
        return token


def split(s, comments=False, posix=True):
    """Split the string 's' using shell-like syntax."""
    if s is None:
        raise ValueError("s argument must not be None")
    lex = Lexer(s, posix=posix)
    lex.whitespace_split = True
    if not comments:
        lex.commenters = ""
    return list(lex)


def join(split_command):
    """Reverse of split(): quote and join an iterable of arguments."""
    return " ".join(quote(arg) for arg in split_command)


_find_unsafe = re.compile(r"[^\w@%+=:,./-]", re.ASCII).search


def quote(s):
    """Return a shell-escaped version of the string 's'."""
    if not s:
        return "''"
    if _find_unsafe(s) is None:
        return s
    return "'" + s.replace("'", "'\"'\"'") + "'"
