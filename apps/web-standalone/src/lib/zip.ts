/**
 * In-browser ZIP extraction with zip-bomb / path-traversal guards.
 *
 * Uses fflate's synchronous unzipper. Decompression happens entirely in the
 * browser; the archive is never uploaded. Guards cap entry count, per-file size
 * and total uncompressed size, and reject path-traversal entries so a malicious
 * archive cannot blow up memory or escape the virtual root.
 */
import { unzipSync, strFromU8 } from "fflate";
import {
  MAX_FILE_BYTES,
  shouldKeep,
  looksBinary,
  type CollectResult,
} from "./collect";

/** Hard caps to defuse zip bombs. */
export const ZIP_LIMITS = {
  maxEntries: 20_000,
  maxFileBytes: MAX_FILE_BYTES,
  maxTotalBytes: 200 * 1024 * 1024, // 200 MB uncompressed across the archive
};

export class ZipGuardError extends Error {}

/** True if an entry name tries to traverse outside the archive root. */
function isUnsafePath(name: string): boolean {
  if (name.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(name)) return true; // absolute
  const parts = name.split(/[\\/]/);
  return parts.some((p) => p === "..");
}

/** Strip a single leading top-level folder (common in downloaded archives). */
function normalizeRoot(names: string[]): (n: string) => string {
  const tops = new Set<string>();
  for (const n of names) {
    const first = n.split("/")[0];
    if (first) tops.add(first);
  }
  if (tops.size === 1) {
    const prefix = [...tops][0] + "/";
    return (n: string) => (n.startsWith(prefix) ? n.slice(prefix.length) : n);
  }
  return (n: string) => n;
}

/**
 * Extract a ZIP (as bytes) into a {path: text} map. Skips directories, binaries,
 * lockfiles, vendored dirs and oversized files; enforces the zip-bomb caps.
 */
export function extractZip(bytes: Uint8Array): CollectResult {
  const entries = unzipSync(bytes, {
    // Skip obvious directory entries up front.
    filter: (file) => !file.name.endsWith("/"),
  });

  const names = Object.keys(entries);
  if (names.length > ZIP_LIMITS.maxEntries) {
    throw new ZipGuardError(
      `Archive has ${names.length} entries (limit ${ZIP_LIMITS.maxEntries}). Refusing to extract.`,
    );
  }

  const strip = normalizeRoot(names);
  const files: Record<string, string> = {};
  const skipped: string[] = [];
  let total = 0;

  for (const rawName of names) {
    if (isUnsafePath(rawName)) {
      skipped.push(`${rawName} (unsafe path)`);
      continue;
    }
    const data = entries[rawName];
    const rel = strip(rawName);
    if (!rel) continue;

    if (data.length > ZIP_LIMITS.maxFileBytes) {
      skipped.push(`${rel} (too large)`);
      continue;
    }
    total += data.length;
    if (total > ZIP_LIMITS.maxTotalBytes) {
      throw new ZipGuardError(
        `Uncompressed contents exceed ${Math.round(
          ZIP_LIMITS.maxTotalBytes / (1024 * 1024),
        )} MB. Refusing to extract (possible zip bomb).`,
      );
    }
    if (!shouldKeep(rel)) {
      skipped.push(rel);
      continue;
    }
    const text = strFromU8(data);
    if (looksBinary(text)) {
      skipped.push(`${rel} (binary)`);
      continue;
    }
    files[rel] = text;
  }

  return { files, skipped };
}

/** Read a File (zip) into bytes and extract it. */
export async function extractZipFile(file: File): Promise<CollectResult> {
  const buf = await file.arrayBuffer();
  return extractZip(new Uint8Array(buf));
}
