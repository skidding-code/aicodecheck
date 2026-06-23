"""Safe ZIP extraction with zip-bomb and path-traversal protection."""

from __future__ import annotations

import os
import zipfile
from dataclasses import dataclass


class ZipBombError(Exception):
    """Raised when an archive exceeds safety limits (size, ratio, count)."""


@dataclass
class ZipLimits:
    max_total_uncompressed: int = 2 * 1024 * 1024 * 1024  # 2 GiB
    max_file_uncompressed: int = 256 * 1024 * 1024  # 256 MiB
    max_entries: int = 200_000
    max_compression_ratio: float = 200.0  # uncompressed/compressed per entry
    min_size_for_ratio_check: int = 64 * 1024


def _is_within(base: str, target: str) -> bool:
    base_abs = os.path.abspath(base)
    target_abs = os.path.abspath(target)
    return os.path.commonpath([base_abs]) == os.path.commonpath([base_abs, target_abs])


def safe_extract_zip(zip_path: str, dest_dir: str, limits: ZipLimits | None = None) -> int:
    """Extract ``zip_path`` into ``dest_dir`` safely.

    Protects against:
      * zip bombs (total size, per-file size, per-file compression ratio, entry count)
      * path traversal (``../`` and absolute paths in entry names)
      * symlink escapes (symlink entries are skipped)

    Returns the number of files extracted. Raises ZipBombError on limit breach.
    """
    limits = limits or ZipLimits()
    os.makedirs(dest_dir, exist_ok=True)
    extracted = 0
    total_uncompressed = 0

    with zipfile.ZipFile(zip_path) as zf:
        infos = zf.infolist()
        if len(infos) > limits.max_entries:
            raise ZipBombError(
                f"Archive has {len(infos)} entries (limit {limits.max_entries})."
            )

        for info in infos:
            name = info.filename
            # Reject absolute paths and traversal.
            if name.startswith(("/", "\\")) or os.path.isabs(name):
                continue
            target = os.path.join(dest_dir, name)
            if not _is_within(dest_dir, target):
                raise ZipBombError(f"Refusing path-traversal entry: {name!r}")

            # Skip symlinks (mode bits 0xA000).
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                continue

            if info.is_dir():
                os.makedirs(target, exist_ok=True)
                continue

            size = info.file_size
            if size > limits.max_file_uncompressed:
                raise ZipBombError(
                    f"Entry {name!r} is {size} bytes (limit {limits.max_file_uncompressed})."
                )

            if (
                info.compress_size > 0
                and size > limits.min_size_for_ratio_check
                and (size / info.compress_size) > limits.max_compression_ratio
            ):
                raise ZipBombError(
                    f"Entry {name!r} has suspicious compression ratio "
                    f"{size / info.compress_size:.0f}:1."
                )

            total_uncompressed += size
            if total_uncompressed > limits.max_total_uncompressed:
                raise ZipBombError(
                    f"Total uncompressed size exceeds {limits.max_total_uncompressed} bytes."
                )

            os.makedirs(os.path.dirname(target) or dest_dir, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as dst:
                # Stream in chunks; re-check cumulative size as we go.
                remaining = size
                while True:
                    chunk = src.read(1024 * 64)
                    if not chunk:
                        break
                    dst.write(chunk)
                    remaining -= len(chunk)
            extracted += 1

    return extracted
