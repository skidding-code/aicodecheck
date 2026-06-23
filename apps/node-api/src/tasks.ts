/**
 * Analysis tasks executed by the job queue. Each manages its own job-state
 * updates and runs the shared engine over the ingested files. Mirrors the
 * Python API's tasks module.
 */

import { Engine, analyzeFiles } from "@aicodecheck/detector-core";

import { getStore } from "./db.js";
import {
  cloneRepository,
  extractZip,
  rmrf,
  walkDirectory,
} from "./ingestion.js";
import { getSettings } from "./config.js";
import { decryptToken } from "./security.js";

const engine = new Engine();

export interface RepositoryTaskPayload {
  jobId: string;
  reference: string;
  url: string;
  tokenEncrypted: string | null;
  ref: string | null;
  maxFiles: number;
  cacheKey: string | null;
}

export interface ZipTaskPayload {
  jobId: string;
  zipPath: string;
  cacheKey: string | null;
}

export async function analyzeRepositoryTask(p: RepositoryTaskPayload): Promise<string> {
  const store = await getStore();
  let clonePath: string | null = null;
  try {
    await store.updateJob(p.jobId, { status: "running", progress: 0.1 });
    const token = p.tokenEncrypted ? decryptToken(p.tokenEncrypted) : null;
    clonePath = await cloneRepository(p.url, token, p.ref);
    await store.updateJob(p.jobId, { progress: 0.5 });
    const files = await walkDirectory(clonePath, p.maxFiles);
    await store.updateJob(p.jobId, { progress: 0.7 });
    const result = engine.analyze(
      loadFolderScan(files),
      p.jobId,
    );
    // Attach owner/repo to the target so history/repository lookup works.
    annotateRepoTarget(result, p.reference);
    await store.saveAnalysis(result, { job_id: p.jobId, cache_key: p.cacheKey });
    await store.updateJob(p.jobId, { status: "finished", progress: 1 });
    return p.jobId;
  } catch (err) {
    await store.updateJob(p.jobId, {
      status: "failed",
      error: String((err as Error)?.message ?? err).slice(0, 2000),
    });
    throw err;
  } finally {
    if (clonePath) await rmrf(clonePath);
  }
}

export async function analyzeZipTask(p: ZipTaskPayload): Promise<string> {
  const store = await getStore();
  try {
    await store.updateJob(p.jobId, { status: "running", progress: 0.1 });
    const files = await extractZip(p.zipPath);
    await store.updateJob(p.jobId, { progress: 0.6 });
    const result = analyzeFiles(files, engine);
    // Re-id with the job id so /analysis/:jobId resolves.
    const withId = { ...result, id: p.jobId };
    await store.saveAnalysis(withId, { job_id: p.jobId, cache_key: p.cacheKey });
    await store.updateJob(p.jobId, { status: "finished", progress: 1 });
    return p.jobId;
  } catch (err) {
    await store.updateJob(p.jobId, {
      status: "failed",
      error: String((err as Error)?.message ?? err).slice(0, 2000),
    });
    throw err;
  } finally {
    await rmrf(p.zipPath);
    // best-effort: clean stale work dir contents older than ttl is omitted.
    void getSettings();
  }
}

// --- helpers --------------------------------------------------------------- //

import { loadFiles } from "@aicodecheck/detector-core";
import type { AnalysisResult } from "@aicodecheck/detector-core";

function loadFolderScan(files: Record<string, string>) {
  return loadFiles(files);
}

function annotateRepoTarget(result: AnalysisResult, reference: string): void {
  // reference is owner/repo or a URL; extract owner/repo for history filtering.
  const cleaned = reference
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/^git@[^:]+:/i, "")
    .replace(/\.git$/i, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length >= 2) {
    result.target.owner = parts[parts.length - 2]!;
    result.target.repo = parts[parts.length - 1]!;
    result.target.name = `${result.target.owner}/${result.target.repo}`;
  }
  result.target.kind = "repository";
}
