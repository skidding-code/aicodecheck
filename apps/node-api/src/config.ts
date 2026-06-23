/**
 * Application configuration via environment variables.
 *
 * Mirrors the Python API's settings. All values have safe defaults so the app
 * runs with zero external infrastructure (in-memory/SQLite store + in-process
 * job queue). Set DATABASE_URL (Postgres) and/or REDIS_URL (BullMQ) to opt in
 * to the production backends.
 */

import os from "node:os";
import path from "node:path";

export interface Settings {
  appName: string;
  environment: string;
  port: number;
  corsOrigins: string[];

  /** Postgres connection string, e.g. postgres://user:pw@db:5432/aipd. When
   *  unset, a local better-sqlite3 file (or :memory:) is used. */
  databaseUrl: string | null;
  /** Path to the SQLite database file (used when DATABASE_URL is unset). */
  sqlitePath: string;

  /** Redis URL. When set, jobs run via BullMQ; otherwise an in-process queue. */
  redisUrl: string | null;

  // Security / limits
  rateLimitPerMinute: number;
  maxUploadBytes: number;
  maxSnippetBytes: number;
  maxRepoFiles: number;
  cloneTimeoutSeconds: number;
  allowPrivateNetworkTargets: boolean;
  tokenEncryptionKey: string | null;

  // Zip-bomb guard
  maxZipEntries: number;
  maxZipUncompressedBytes: number;
  maxZipFileBytes: number;
  maxZipRatio: number;

  // Worker / cache
  analysisCacheTtlSeconds: number;
  workDir: string;
}

function envStr(name: string, fallback: string | null = null): string | null {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envList(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let _cached: Settings | null = null;

export function getSettings(): Settings {
  if (_cached) return _cached;
  _cached = {
    appName: envStr("AIPD_APP_NAME", "AI Project Detector API")!,
    environment: envStr("NODE_ENV", "development")!,
    port: envInt("PORT", 8080),
    corsOrigins: envList("CORS_ORIGINS", [
      "http://localhost:5173",
      "http://localhost:4173",
    ]),

    databaseUrl: envStr("DATABASE_URL", null),
    sqlitePath: envStr("SQLITE_PATH", path.join(process.cwd(), "aipd.db"))!,

    redisUrl: envStr("REDIS_URL", null),

    rateLimitPerMinute: envInt("RATE_LIMIT_PER_MINUTE", 60),
    maxUploadBytes: envInt("MAX_UPLOAD_BYTES", 100 * 1024 * 1024),
    maxSnippetBytes: envInt("MAX_SNIPPET_BYTES", 1 * 1024 * 1024),
    maxRepoFiles: envInt("MAX_REPO_FILES", 50_000),
    cloneTimeoutSeconds: envInt("CLONE_TIMEOUT_SECONDS", 600),
    allowPrivateNetworkTargets: envBool("ALLOW_PRIVATE_NETWORK_TARGETS", false),
    tokenEncryptionKey: envStr("TOKEN_ENCRYPTION_KEY", null),

    maxZipEntries: envInt("MAX_ZIP_ENTRIES", 50_000),
    maxZipUncompressedBytes: envInt("MAX_ZIP_UNCOMPRESSED_BYTES", 500 * 1024 * 1024),
    maxZipFileBytes: envInt("MAX_ZIP_FILE_BYTES", 25 * 1024 * 1024),
    maxZipRatio: envInt("MAX_ZIP_RATIO", 200),

    analysisCacheTtlSeconds: envInt("ANALYSIS_CACHE_TTL_SECONDS", 24 * 3600),
    workDir: envStr("WORK_DIR", path.join(os.tmpdir(), "aipd-work"))!,
  };
  return _cached;
}

/** Test helper: reset memoized settings so env changes take effect. */
export function resetSettings(): void {
  _cached = null;
}

export function usingRedis(): boolean {
  return Boolean(getSettings().redisUrl);
}

export function usingPostgres(): boolean {
  const url = getSettings().databaseUrl;
  return Boolean(url && /^postgres(ql)?:\/\//i.test(url));
}
