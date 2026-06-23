# Security

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a
public issue. Include steps to reproduce and the potential impact.

## Security properties of this project

The detector ingests untrusted input (arbitrary repositories, archives, and
pasted code), so input handling is treated as a security boundary.

* **ZIP handling** — extraction is guarded against zip bombs (caps on total
  uncompressed size, per-entry size, entry count, and compression ratio) and
  against path traversal and symlink escapes. See
  `packages/detector-core/aiprojectdetector/ingestion/archive.py`.
* **SSRF** — repository references are validated before cloning; hosts resolving
  to private/loopback/link-local ranges are refused by default (configurable via
  `AIPD_ALLOW_PRIVATE_NETWORK_TARGETS`). See `ingestion/github.py`.
* **Token handling** — access tokens are encrypted at rest (Fernet) and never
  logged. Set `AIPD_TOKEN_ENCRYPTION_KEY` in production so tokens survive
  restarts and share a key across API and worker.
* **Path traversal / resource limits** — file size caps, max file counts, and
  rate limiting are enforced by the API (`apps/python-api/app/security.py`,
  `config.py`).
* **Least privilege** — the API container runs as a non-root user.
* **No code execution** — analyzed code is parsed and measured statically; it is
  never executed.
* **Privacy** — repository/archive inputs are not retained after analysis (only
  the resulting report is stored). The browser-only variant
  (`apps/web-standalone`) never transmits code off the user's machine.

## Operational guidance

* Run behind a reverse proxy with TLS.
* Set a strong `AIPD_TOKEN_ENCRYPTION_KEY` and a real `AIPD_DATABASE_URL`.
* Keep `AIPD_ALLOW_PRIVATE_NETWORK_TARGETS=false` unless you specifically need to
  analyze internal hosts and understand the SSRF implications.
