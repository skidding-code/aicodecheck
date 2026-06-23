/**
 * Best-effort, in-browser GitHub repository fetch.
 *
 * This is the ONE optional place the app touches the network — and only to pull
 * public source from GitHub directly into the browser; the code is still
 * analyzed locally and never sent to any server of ours.
 *
 * Strategy:
 *   1. Try the codeload tarball (https://codeload.github.com/.../tar.gz/...),
 *      gunzip + untar in-browser. Fast, one request, no rate-limit token needed,
 *      but subject to GitHub's CORS policy.
 *   2. Fall back to the REST git/trees API + raw.githubusercontent.com, which is
 *      CORS-enabled but rate-limited (an optional in-memory token raises limits).
 *
 * Limitations surfaced to the user: public repos only, CORS may block the
 * tarball path, GitHub rate limits apply, and NO git history is available in the
 * browser (so commit/contributor signals are absent — that's expected).
 */
import { gunzipSync, strFromU8 } from "fflate";
import { shouldKeep, looksBinary, MAX_FILE_BYTES, type CollectResult } from "./collect";

export interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
}

/** Parse owner/repo or a github URL into a RepoRef. */
export function parseRepoInput(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // URL form: https://github.com/owner/repo(/tree/branch)?
  const urlMatch = trimmed.match(
    /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^/\s#?]+))?(?:[/#?].*)?$/i,
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      branch: urlMatch[3],
    };
  }

  // owner/repo[@branch] form.
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s@]+)(?:@(.+))?$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      branch: shortMatch[3],
    };
  }
  return null;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Resolve the default branch via the REST API (best-effort). */
async function resolveDefaultBranch(ref: RepoRef, token?: string): Promise<string> {
  if (ref.branch) return ref.branch;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}`,
      { headers: authHeaders(token) },
    );
    if (res.ok) {
      const data = (await res.json()) as { default_branch?: string };
      if (data.default_branch) return data.default_branch;
    }
  } catch {
    /* ignore; fall through to common defaults */
  }
  return "main";
}

// --- Minimal in-browser tar reader (USTAR) ------------------------------- //

interface TarEntry {
  name: string;
  data: Uint8Array;
  type: string;
}

function readTar(buf: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  const decoder = new TextDecoder();
  const readStr = (start: number, len: number) =>
    decoder.decode(buf.subarray(start, start + len)).replace(/\0.*$/, "").trim();

  while (offset + 512 <= buf.length) {
    const name = readStr(offset, 100);
    if (!name) break; // two zero blocks => end of archive
    const sizeStr = readStr(offset + 124, 12);
    const size = parseInt(sizeStr || "0", 8) || 0;
    const typeFlag = readStr(offset + 156, 1) || "0";
    const prefix = readStr(offset + 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const dataStart = offset + 512;
    const data = buf.subarray(dataStart, dataStart + size);
    entries.push({ name: fullName, data, type: typeFlag });
    // advance past header + data, padded to 512.
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function stripTopFolder(name: string): string {
  const idx = name.indexOf("/");
  return idx >= 0 ? name.slice(idx + 1) : name;
}

/** Path #1: codeload tarball -> gunzip -> untar -> {path: text}. */
async function fetchViaTarball(ref: RepoRef, branch: string): Promise<CollectResult> {
  const url = `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/refs/heads/${branch}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`codeload responded ${res.status} ${res.statusText}`);
  }
  const gz = new Uint8Array(await res.arrayBuffer());
  const tar = gunzipSync(gz);
  const entries = readTar(tar);

  const files: Record<string, string> = {};
  const skipped: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "0" && entry.type !== "") continue; // regular files only
    const rel = stripTopFolder(entry.name);
    if (!rel) continue;
    if (entry.data.length > MAX_FILE_BYTES) {
      skipped.push(`${rel} (too large)`);
      continue;
    }
    if (!shouldKeep(rel)) {
      skipped.push(rel);
      continue;
    }
    const text = strFromU8(entry.data);
    if (looksBinary(text)) {
      skipped.push(`${rel} (binary)`);
      continue;
    }
    files[rel] = text;
  }
  return { files, skipped };
}

/** Path #2: REST git/trees (recursive) + raw contents. CORS-friendly fallback. */
async function fetchViaApi(
  ref: RepoRef,
  branch: string,
  token?: string,
): Promise<CollectResult> {
  const treeRes = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${branch}?recursive=1`,
    { headers: authHeaders(token) },
  );
  if (!treeRes.ok) {
    if (treeRes.status === 403) {
      throw new Error(
        "GitHub API rate limit hit (HTTP 403). Add a personal access token to raise the limit, or use ZIP upload.",
      );
    }
    throw new Error(`GitHub trees API responded ${treeRes.status} ${treeRes.statusText}`);
  }
  const tree = (await treeRes.json()) as {
    truncated?: boolean;
    tree: Array<{ path: string; type: string; size?: number }>;
  };

  const blobs = tree.tree.filter(
    (e) =>
      e.type === "blob" &&
      shouldKeep(e.path) &&
      (e.size ?? 0) <= MAX_FILE_BYTES,
  );

  const files: Record<string, string> = {};
  const skipped: string[] = [];
  if (tree.truncated) {
    skipped.push("(repo tree was truncated by GitHub; some files omitted)");
  }

  // Fetch raw contents with bounded concurrency to be gentle on rate limits.
  const concurrency = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < blobs.length) {
      const item = blobs[cursor++];
      const rawUrl = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${item.path}`;
      try {
        const r = await fetch(rawUrl, { headers: token ? authHeaders(token) : undefined });
        if (!r.ok) {
          skipped.push(`${item.path} (HTTP ${r.status})`);
          continue;
        }
        const text = await r.text();
        if (looksBinary(text)) {
          skipped.push(`${item.path} (binary)`);
          continue;
        }
        files[item.path] = text;
      } catch {
        skipped.push(`${item.path} (fetch failed)`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { files, skipped };
}

export interface FetchRepoResult extends CollectResult {
  ref: Required<RepoRef>;
  via: "tarball" | "api";
}

/**
 * Fetch a public GitHub repo into a {path: text} map, trying the tarball first
 * and falling back to the REST API. Throws a helpful error if both fail.
 */
export async function fetchRepo(
  input: RepoRef,
  token?: string,
): Promise<FetchRepoResult> {
  const branch = await resolveDefaultBranch(input, token);
  const resolved: Required<RepoRef> = {
    owner: input.owner,
    repo: input.repo,
    branch,
  };

  // Try tarball (fast, no token), then API.
  const errors: string[] = [];
  try {
    const out = await fetchViaTarball(input, branch);
    if (Object.keys(out.files).length > 0) {
      return { ...out, ref: resolved, via: "tarball" };
    }
    errors.push("tarball returned no analyzable files");
  } catch (err) {
    errors.push(`tarball: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const out = await fetchViaApi(input, branch, token);
    if (Object.keys(out.files).length > 0) {
      return { ...out, ref: resolved, via: "api" };
    }
    errors.push("API returned no analyzable files");
  } catch (err) {
    errors.push(`api: ${err instanceof Error ? err.message : String(err)}`);
  }

  throw new Error(
    `Could not fetch ${input.owner}/${input.repo} in the browser. ` +
      `This only works for PUBLIC repos and can be blocked by GitHub CORS or rate limits. ` +
      `Try the ZIP-upload path instead. Details: ${errors.join("; ")}`,
  );
}
