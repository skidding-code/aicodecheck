/**
 * Persistence layer: jobs, analyses, history, and the analysis cache.
 *
 * A small `Store` interface decouples the routes/worker from the backend. The
 * default implementation uses better-sqlite3 (zero infra; a file or :memory:).
 * A Postgres implementation (behind `pg`) is lazily loaded when DATABASE_URL
 * points at Postgres. Reports are stored as JSON blobs, exactly like the
 * Python API.
 */

import { getSettings, usingPostgres } from "./config.js";
import type { AnalysisResult } from "@aicodecheck/detector-core";

export interface JobRecord {
  id: string;
  status: string; // queued | running | finished | failed
  kind: string;
  target: string;
  progress: number;
  error: string | null;
  cache_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRecord {
  id: string;
  job_id: string | null;
  kind: string;
  target_name: string;
  owner: string | null;
  repo: string | null;
  cache_key: string | null;
  ai_probability: number;
  human_probability: number;
  confidence: number;
  classification: string;
  report: AnalysisResult;
  created_at: string;
}

export interface HistoryItem {
  id: string;
  kind: string;
  target_name: string;
  classification: string;
  ai_probability: number;
  confidence: number;
  created_at: string;
}

export interface Store {
  init(): Promise<void> | void;
  createJob(job: {
    id: string;
    kind: string;
    target: string;
    cache_key: string | null;
  }): Promise<void> | void;
  updateJob(
    id: string,
    patch: { status?: string; progress?: number; error?: string | null },
  ): Promise<void> | void;
  getJob(id: string): Promise<JobRecord | null> | JobRecord | null;
  saveAnalysis(
    result: AnalysisResult,
    opts?: { job_id?: string | null; cache_key?: string | null },
  ): Promise<void> | void;
  getAnalysis(id: string): Promise<AnalysisRecord | null> | AnalysisRecord | null;
  findCached(
    cacheKey: string,
    ttlSeconds: number,
  ): Promise<AnalysisRecord | null> | AnalysisRecord | null;
  listHistory(opts: {
    limit: number;
    owner?: string | null;
  }): Promise<HistoryItem[]> | HistoryItem[];
  findRepositoryAnalyses(
    owner: string,
    repo: string,
  ): Promise<AnalysisRecord[]> | AnalysisRecord[];
  close(): Promise<void> | void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toHistoryItem(a: AnalysisRecord): HistoryItem {
  return {
    id: a.id,
    kind: a.kind,
    target_name: a.target_name,
    classification: a.classification,
    ai_probability: a.ai_probability,
    confidence: a.confidence,
    created_at: a.created_at,
  };
}

// --------------------------------------------------------------------------- //
// SQLite (default — zero infra)                                               //
// --------------------------------------------------------------------------- //

interface SqliteDatabase {
  pragma(s: string): unknown;
  exec(s: string): unknown;
  prepare(s: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
}

class SqliteStore implements Store {
  private db!: SqliteDatabase;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async init(): Promise<void> {
    const mod = await import("better-sqlite3");
    const Database = (mod.default ?? mod) as unknown as new (
      p: string,
    ) => SqliteDatabase;
    this.db = new Database(this.path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        kind TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        progress REAL NOT NULL DEFAULT 0,
        error TEXT,
        cache_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        kind TEXT NOT NULL,
        target_name TEXT NOT NULL DEFAULT '',
        owner TEXT,
        repo TEXT,
        cache_key TEXT,
        ai_probability REAL NOT NULL DEFAULT 0.5,
        human_probability REAL NOT NULL DEFAULT 0.5,
        confidence REAL NOT NULL DEFAULT 0,
        classification TEXT NOT NULL DEFAULT 'uncertain',
        report TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_analyses_cache ON analyses(cache_key);
      CREATE INDEX IF NOT EXISTS idx_analyses_owner_repo ON analyses(owner, repo);
      CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at);
    `);
  }

  createJob(job: {
    id: string;
    kind: string;
    target: string;
    cache_key: string | null;
  }): void {
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO jobs (id, status, kind, target, progress, error, cache_key, created_at, updated_at)
         VALUES (?, 'queued', ?, ?, 0, NULL, ?, ?, ?)`,
      )
      .run(job.id, job.kind, job.target, job.cache_key, ts, ts);
  }

  updateJob(
    id: string,
    patch: { status?: string; progress?: number; error?: string | null },
  ): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.status !== undefined) {
      sets.push("status = ?");
      vals.push(patch.status);
    }
    if (patch.progress !== undefined) {
      sets.push("progress = ?");
      vals.push(patch.progress);
    }
    if (patch.error !== undefined) {
      sets.push("error = ?");
      vals.push(patch.error);
    }
    sets.push("updated_at = ?");
    vals.push(nowIso());
    vals.push(id);
    this.db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  getJob(id: string): JobRecord | null {
    const row = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
      | JobRecord
      | undefined;
    return row ?? null;
  }

  saveAnalysis(
    result: AnalysisResult,
    opts: { job_id?: string | null; cache_key?: string | null } = {},
  ): void {
    const t = result.target;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO analyses
          (id, job_id, kind, target_name, owner, repo, cache_key,
           ai_probability, human_probability, confidence, classification, report, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        result.id,
        opts.job_id ?? null,
        t.kind,
        t.name,
        t.owner ?? null,
        t.repo ?? null,
        opts.cache_key ?? null,
        result.overall_ai_probability,
        result.human_probability,
        result.confidence,
        result.classification,
        JSON.stringify(result),
        result.generated_at ?? nowIso(),
      );
  }

  private hydrate(row: Record<string, unknown>): AnalysisRecord {
    return {
      ...(row as unknown as AnalysisRecord),
      report: JSON.parse(row.report as string) as AnalysisResult,
    };
  }

  getAnalysis(id: string): AnalysisRecord | null {
    const row = this.db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.hydrate(row) : null;
  }

  findCached(cacheKey: string, ttlSeconds: number): AnalysisRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM analyses WHERE cache_key = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(cacheKey) as Record<string, unknown> | undefined;
    if (!row) return null;
    const ageMs = Date.now() - new Date(row.created_at as string).getTime();
    if (ageMs > ttlSeconds * 1000) return null;
    return this.hydrate(row);
  }

  listHistory(opts: { limit: number; owner?: string | null }): HistoryItem[] {
    let rows: Record<string, unknown>[];
    if (opts.owner) {
      rows = this.db
        .prepare(
          `SELECT * FROM analyses WHERE owner = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(opts.owner, opts.limit) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare(`SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?`)
        .all(opts.limit) as Record<string, unknown>[];
    }
    return rows.map((r) => toHistoryItem(this.hydrate(r)));
  }

  findRepositoryAnalyses(owner: string, repo: string): AnalysisRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM analyses WHERE owner = ? AND repo = ? ORDER BY created_at DESC`,
      )
      .all(owner, repo) as Record<string, unknown>[];
    return rows.map((r) => this.hydrate(r));
  }

  close(): void {
    this.db.close();
  }
}

// --------------------------------------------------------------------------- //
// Postgres (optional — behind `pg`, lazily loaded)                            //
// --------------------------------------------------------------------------- //

class PostgresStore implements Store {
  private pool!: {
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
    end(): Promise<void>;
  };
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  async init(): Promise<void> {
    // Lazy, untyped import so the app builds/runs without `pg` installed.
    const pg = (await import(/* @vite-ignore */ "pg" as string)) as unknown as {
      default?: { Pool: new (cfg: unknown) => PostgresStore["pool"] };
      Pool?: new (cfg: unknown) => PostgresStore["pool"];
    };
    const Pool = (pg.default?.Pool ?? pg.Pool)!;
    this.pool = new Pool({ connectionString: this.url });
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        kind TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        progress DOUBLE PRECISION NOT NULL DEFAULT 0,
        error TEXT,
        cache_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        kind TEXT NOT NULL,
        target_name TEXT NOT NULL DEFAULT '',
        owner TEXT,
        repo TEXT,
        cache_key TEXT,
        ai_probability DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        human_probability DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
        classification TEXT NOT NULL DEFAULT 'uncertain',
        report JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_analyses_cache ON analyses(cache_key);
      CREATE INDEX IF NOT EXISTS idx_analyses_owner_repo ON analyses(owner, repo);
    `);
  }

  async createJob(job: {
    id: string;
    kind: string;
    target: string;
    cache_key: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO jobs (id, status, kind, target, cache_key)
       VALUES ($1,'queued',$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET status='queued', kind=$2, target=$3, cache_key=$4`,
      [job.id, job.kind, job.target, job.cache_key],
    );
  }

  async updateJob(
    id: string,
    patch: { status?: string; progress?: number; error?: string | null },
  ): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (patch.status !== undefined) {
      sets.push(`status = $${i++}`);
      vals.push(patch.status);
    }
    if (patch.progress !== undefined) {
      sets.push(`progress = $${i++}`);
      vals.push(patch.progress);
    }
    if (patch.error !== undefined) {
      sets.push(`error = $${i++}`);
      vals.push(patch.error);
    }
    sets.push(`updated_at = now()`);
    vals.push(id);
    await this.pool.query(
      `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${i}`,
      vals,
    );
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
    return (rows[0] as JobRecord) ?? null;
  }

  async saveAnalysis(
    result: AnalysisResult,
    opts: { job_id?: string | null; cache_key?: string | null } = {},
  ): Promise<void> {
    const t = result.target;
    await this.pool.query(
      `INSERT INTO analyses
        (id, job_id, kind, target_name, owner, repo, cache_key,
         ai_probability, human_probability, confidence, classification, report, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET report = EXCLUDED.report`,
      [
        result.id,
        opts.job_id ?? null,
        t.kind,
        t.name,
        t.owner ?? null,
        t.repo ?? null,
        opts.cache_key ?? null,
        result.overall_ai_probability,
        result.human_probability,
        result.confidence,
        result.classification,
        JSON.stringify(result),
        result.generated_at ?? nowIso(),
      ],
    );
  }

  private hydrate(row: Record<string, unknown>): AnalysisRecord {
    const report =
      typeof row.report === "string"
        ? (JSON.parse(row.report) as AnalysisResult)
        : (row.report as AnalysisResult);
    return {
      ...(row as unknown as AnalysisRecord),
      created_at: new Date(row.created_at as string).toISOString(),
      report,
    };
  }

  async getAnalysis(id: string): Promise<AnalysisRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM analyses WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? this.hydrate(rows[0] as Record<string, unknown>) : null;
  }

  async findCached(
    cacheKey: string,
    ttlSeconds: number,
  ): Promise<AnalysisRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM analyses WHERE cache_key = $1 AND created_at > now() - ($2 || ' seconds')::interval
       ORDER BY created_at DESC LIMIT 1`,
      [cacheKey, String(ttlSeconds)],
    );
    return rows[0] ? this.hydrate(rows[0] as Record<string, unknown>) : null;
  }

  async listHistory(opts: {
    limit: number;
    owner?: string | null;
  }): Promise<HistoryItem[]> {
    const { rows } = opts.owner
      ? await this.pool.query(
          `SELECT * FROM analyses WHERE owner = $1 ORDER BY created_at DESC LIMIT $2`,
          [opts.owner, opts.limit],
        )
      : await this.pool.query(
          `SELECT * FROM analyses ORDER BY created_at DESC LIMIT $1`,
          [opts.limit],
        );
    return (rows as Record<string, unknown>[]).map((r) =>
      toHistoryItem(this.hydrate(r)),
    );
  }

  async findRepositoryAnalyses(
    owner: string,
    repo: string,
  ): Promise<AnalysisRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM analyses WHERE owner = $1 AND repo = $2 ORDER BY created_at DESC`,
      [owner, repo],
    );
    return (rows as Record<string, unknown>[]).map((r) => this.hydrate(r));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// --------------------------------------------------------------------------- //

export function computeCacheKey(
  kind: string,
  target: string,
  configRepr: string,
): string {
  // Lightweight stable hash (FNV-1a). Avoids needing node:crypto here and is
  // sufficient for cache-key bucketing.
  const raw = `${kind}|${target}|${configRepr}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + String(raw.length);
}

let _store: Store | null = null;

export async function getStore(): Promise<Store> {
  if (_store) return _store;
  const settings = getSettings();
  if (usingPostgres()) {
    _store = new PostgresStore(settings.databaseUrl!);
  } else {
    _store = new SqliteStore(settings.sqlitePath);
  }
  await _store.init();
  return _store;
}

/** Test helper: force an in-memory SQLite store and reset the singleton. */
export async function useInMemoryStore(): Promise<Store> {
  if (_store) await _store.close();
  _store = new SqliteStore(":memory:");
  await _store.init();
  return _store;
}

export async function resetStore(): Promise<void> {
  if (_store) await _store.close();
  _store = null;
}
