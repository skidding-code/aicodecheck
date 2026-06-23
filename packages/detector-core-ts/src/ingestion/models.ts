/** In-memory representation of an ingested target. Faithful port. */

import type { CommitInfo, ContributorStat } from "../models.js";

export interface ScannedFile {
  rel_path: string; // path relative to the scan root, POSIX-style
  abs_path: string | null;
  language: string;
  size_bytes: number;
  source: string; // decoded text content
  is_generated: boolean;
  is_documentation: boolean;
  is_config: boolean;
  is_test: boolean;
  is_ci: boolean;
  is_dependency_manifest: boolean;
}

export function fileLoc(f: { source: string }): number {
  return f.source ? countNewlines(f.source) + 1 : 0;
}

function countNewlines(s: string): number {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") c++;
  return c;
}

export interface Scan {
  kind: string; // repository | folder | zip | file | snippet
  name: string;
  source: string; // url / path / "<snippet>"
  root: string | null;
  files: ScannedFile[];

  owner: string | null;
  repo: string | null;
  ref: string | null;
  git_available: boolean;
  commits: CommitInfo[];
  contributors: ContributorStat[];
  branches: string[];
  tags: string[];

  skipped_files: number;
  bytes_scanned: number;
  warnings: string[];
}

export function makeScan(partial: Partial<Scan> & { kind: string; name: string; source: string }): Scan {
  return {
    kind: partial.kind,
    name: partial.name,
    source: partial.source,
    root: partial.root ?? null,
    files: partial.files ?? [],
    owner: partial.owner ?? null,
    repo: partial.repo ?? null,
    ref: partial.ref ?? null,
    git_available: partial.git_available ?? false,
    commits: partial.commits ?? [],
    contributors: partial.contributors ?? [],
    branches: partial.branches ?? [],
    tags: partial.tags ?? [],
    skipped_files: partial.skipped_files ?? 0,
    bytes_scanned: partial.bytes_scanned ?? 0,
    warnings: partial.warnings ?? [],
  };
}

export function scanLanguages(scan: Scan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of scan.files) out[f.language] = (out[f.language] ?? 0) + 1;
  // Sort by count descending (object insertion order preserves this).
  const entries = Object.entries(out).sort((a, b) => b[1] - a[1]);
  const sorted: Record<string, number> = {};
  for (const [k, v] of entries) sorted[k] = v;
  return sorted;
}

export function scanTotalLoc(scan: Scan): number {
  return scan.files.reduce((a, f) => a + fileLoc(f), 0);
}

/** Files suitable for stylometry (excludes generated/binary-ish). */
export function scanAnalyzable(scan: Scan): ScannedFile[] {
  return scan.files.filter((f) => !f.is_generated && f.source.trim());
}
