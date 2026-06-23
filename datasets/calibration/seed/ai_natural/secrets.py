"""Generate cryptographically strong random values for secrets.

This module wraps the operating system's secure random source for tasks
such as creating tokens, passwords, and account-recovery keys.
"""

import base64
import binascii
import hmac
import os

__all__ = [
    "choice",
    "randbelow",
    "randbits",
    "token_bytes",
    "token_hex",
    "token_urlsafe",
    "compare_digest",
    "DEFAULT_ENTROPY",
]

DEFAULT_ENTROPY = 32  # bytes


def randbits(k):
    """Return a non-negative integer with 'k' random bits."""
    if k < 0:
        raise ValueError("number of bits must be non-negative")
    if k == 0:
        return 0
    numbytes = (k + 7) // 8
    value = int.from_bytes(os.urandom(numbytes), "big")
    return value >> (numbytes * 8 - k)


def randbelow(n):
    """Return a random int in the range [0, n)."""
    if n <= 0:
        raise ValueError("Upper bound must be positive")
    k = n.bit_length()
    r = randbits(k)
    while r >= n:
        r = randbits(k)
    return r


def choice(seq):
    """Choose a random element from a non-empty sequence."""
    if not len(seq):
        raise IndexError("Cannot choose from an empty sequence")
    return seq[randbelow(len(seq))]


def token_bytes(nbytes=None):
    """Return a random byte string containing 'nbytes' bytes."""
    if nbytes is None:
        nbytes = DEFAULT_ENTROPY
    return os.urandom(nbytes)


def token_hex(nbytes=None):
    """Return a random text string, in hexadecimal."""
    return binascii.hexlify(token_bytes(nbytes)).decode("ascii")


def token_urlsafe(nbytes=None):
    """Return a random URL-safe text string, in Base64 encoding."""
    tok = token_bytes(nbytes)
    return base64.urlsafe_b64encode(tok).rstrip(b"=").decode("ascii")


def compare_digest(a, b):
    """Return a == b using a constant-time comparison.

    Accepts either two byte-like objects or two strings (which must be
    ASCII). The time taken does not depend on the position of any
    differing bytes, mitigating timing attacks.
    """
    return hmac.compare_digest(a, b)
