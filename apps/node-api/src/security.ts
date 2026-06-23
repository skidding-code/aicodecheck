/**
 * Security utilities: rate limiting, SSRF guard for repo URLs, token handling,
 * and input/upload size validation. Mirrors the Python API's security module.
 */

import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { NextFunction, Request, Response } from "express";

import { getSettings } from "./config.js";

/** HTTP error carrying a status code, surfaced by the error middleware. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

// --------------------------------------------------------------------------- //
// Rate limiting (sliding-window, in-process)                                  //
// --------------------------------------------------------------------------- //

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const limit = getSettings().rateLimitPerMinute;
  if (limit <= 0) {
    next();
    return;
  }
  const client = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  let bucket = hits.get(client);
  if (!bucket) {
    bucket = [];
    hits.set(client, bucket);
  }
  while (bucket.length && now - bucket[0]! > WINDOW_MS) bucket.shift();
  if (bucket.length >= limit) {
    const retry = Math.ceil((WINDOW_MS - (now - bucket[0]!)) / 1000) + 1;
    res.setHeader("Retry-After", String(retry));
    next(
      new HttpError(
        429,
        `Rate limit exceeded (${limit}/min). Retry in ~${retry}s.`,
      ),
    );
    return;
  }
  bucket.push(now);
  next();
}

/** Test helper to clear the rate-limit buckets between cases. */
export function resetRateLimit(): void {
  hits.clear();
}

// --------------------------------------------------------------------------- //
// Token handling (encrypt-at-rest via AES-256-GCM)                            //
// --------------------------------------------------------------------------- //

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const configured = getSettings().tokenEncryptionKey;
  if (configured) {
    // Accept base64 / hex / raw; derive a 32-byte key deterministically.
    _key = crypto.createHash("sha256").update(configured).digest();
  } else {
    // Ephemeral per-process key (tokens then don't survive a restart).
    _key = crypto.randomBytes(32);
  }
  return _key;
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(blob: string): string {
  try {
    const [ivB64, tagB64, encB64] = blob.split(".");
    const iv = Buffer.from(ivB64!, "base64");
    const tag = Buffer.from(tagB64!, "base64");
    const enc = Buffer.from(encB64!, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    throw new HttpError(400, "Invalid encrypted token.");
  }
}

// --------------------------------------------------------------------------- //
// SSRF / input validation                                                     //
// --------------------------------------------------------------------------- //

export interface RepoReference {
  url: string; // clone URL
  host: string;
  owner: string | null;
  repo: string | null;
}

/** Parse "owner/repo", "github.com/owner/repo", or a full git/http(s) URL. */
export function parseReference(reference: string): RepoReference {
  const ref = reference.trim();
  if (!ref) throw new HttpError(400, "Empty repository reference.");

  // scp-like git: git@host:owner/repo(.git)
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(ref);
  if (scp) {
    const host = scp[1]!;
    const { owner, repo } = splitPath(scp[2]!);
    return { url: ref, host, owner, repo };
  }

  if (/^https?:\/\//i.test(ref) || /^git:\/\//i.test(ref) || /^ssh:\/\//i.test(ref)) {
    let u: URL;
    try {
      u = new URL(ref);
    } catch {
      throw new HttpError(400, `Could not parse repository URL: ${reference}`);
    }
    const { owner, repo } = splitPath(u.pathname.replace(/^\/+/, ""));
    return { url: ref, host: u.hostname, owner, repo };
  }

  // bare "owner/repo" -> assume public GitHub
  const { owner, repo } = splitPath(ref);
  if (!owner || !repo) {
    throw new HttpError(
      400,
      `Could not parse repository reference: ${reference}. Use owner/repo or a URL.`,
    );
  }
  return {
    url: `https://github.com/${owner}/${repo}.git`,
    host: "github.com",
    owner,
    repo,
  };
}

function splitPath(p: string): { owner: string | null; repo: string | null } {
  const parts = p
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
  if (parts.length >= 2) {
    return { owner: parts[parts.length - 2]!, repo: parts[parts.length - 1]! };
  }
  return { owner: null, repo: null };
}

function isPrivateAddress(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split(".").map(Number) as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(addr)) {
    const low = addr.toLowerCase();
    if (low === "::1" || low === "::") return true; // loopback / unspecified
    if (low.startsWith("fe80")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique-local
    // IPv4-mapped
    const m = /::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(low);
    if (m) return isPrivateAddress(m[1]!);
    return false;
  }
  return false;
}

/**
 * Resolve a host and reject if any address is private/loopback/link-local.
 * Returns true if the host is safe to fetch from.
 */
export async function isSafeHost(
  host: string,
  allowPrivate = false,
): Promise<boolean> {
  if (allowPrivate) return true;
  const bare = host.split(":")[0]!.toLowerCase();
  if (bare === "localhost") return false;
  // Literal IPs: check directly.
  if (net.isIP(bare)) return !isPrivateAddress(bare);
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(bare, { all: true });
  } catch {
    return false; // unresolvable -> refuse
  }
  if (!addrs.length) return false;
  return addrs.every((a) => !isPrivateAddress(a.address));
}

/** Throw a 400 if the repo reference resolves to a disallowed host. */
export async function validateRepoReference(
  reference: string,
): Promise<RepoReference> {
  const settings = getSettings();
  const ref = parseReference(reference);
  const host = ref.host.toLowerCase();
  if (host === "github.com" || host === "www.github.com") return ref; // always allowed
  const safe = await isSafeHost(host, settings.allowPrivateNetworkTargets);
  if (!safe) {
    throw new HttpError(
      400,
      `Refusing to clone from host '${host}': it resolves to a disallowed ` +
        `(private/loopback) address or could not be verified.`,
    );
  }
  return ref;
}

export function validateUploadSize(size: number): void {
  const limit = getSettings().maxUploadBytes;
  if (size > limit) {
    throw new HttpError(413, `Upload exceeds limit (${limit} bytes).`);
  }
}

export function validateSnippet(code: string): void {
  const limit = getSettings().maxSnippetBytes;
  if (Buffer.byteLength(code, "utf8") > limit) {
    throw new HttpError(413, `Snippet exceeds ${limit} bytes.`);
  }
}
