"""Parse and normalize GitHub (and GitHub Enterprise) references.

Includes SSRF-conscious validation: only http(s) git hosts, with hostname
allow/deny handled by the caller (see the API's network policy). This module
never performs network I/O itself; it only constructs safe clone URLs.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import quote, urlparse


@dataclass
class GitHubRef:
    owner: str
    repo: str
    host: str = "github.com"
    ref: str | None = None

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.repo}"


_OWNER_REPO_RE = re.compile(r"^(?P<owner>[A-Za-z0-9._-]+)/(?P<repo>[A-Za-z0-9._-]+)$")


def parse_reference(value: str) -> GitHubRef:
    """Parse a URL or ``owner/repo`` string into a GitHubRef.

    Accepts:
      * https://github.com/owner/repo[.git][/tree/ref]
      * https://ghe.example.com/owner/repo
      * git@github.com:owner/repo.git
      * owner/repo
    """
    value = value.strip()

    m = _OWNER_REPO_RE.match(value)
    if m:
        return GitHubRef(owner=m["owner"], repo=_strip_git(m["repo"]))

    # scp-like syntax: git@host:owner/repo.git
    scp = re.match(r"^[\w.-]+@(?P<host>[\w.-]+):(?P<owner>[\w.-]+)/(?P<repo>[\w.-]+)$", value)
    if scp:
        return GitHubRef(owner=scp["owner"], repo=_strip_git(scp["repo"]), host=scp["host"])

    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2:
            owner, repo = parts[0], _strip_git(parts[1])
            ref = None
            if len(parts) >= 4 and parts[2] in {"tree", "blob", "commit"}:
                ref = parts[3]
            return GitHubRef(owner=owner, repo=repo, host=parsed.netloc, ref=ref)

    raise ValueError(f"Could not parse a repository reference from {value!r}")


def _strip_git(repo: str) -> str:
    return repo[:-4] if repo.endswith(".git") else repo


def build_clone_url(ref: GitHubRef, *, token: str | None = None, scheme: str = "https") -> str:
    """Build an HTTPS clone URL, optionally embedding a PAT for private repos."""
    host = ref.host
    if token:
        # x-access-token works for both github.com and GHE.
        return f"{scheme}://x-access-token:{quote(token, safe='')}@{host}/{ref.owner}/{ref.repo}.git"
    return f"{scheme}://{host}/{ref.owner}/{ref.repo}.git"


def is_safe_host(host: str, *, allow_private: bool = False) -> bool:
    """SSRF guard: reject hosts that resolve to private / loopback / link-local IPs.

    Used by the API before cloning a user-supplied URL. Returns False if DNS
    resolution fails (fail-closed).
    """
    host = host.split(":")[0]
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError):
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if not allow_private and (
            ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast
        ):
            return False
    return True
