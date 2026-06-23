/**
 * Message protocol shared between the main thread (engineClient.ts) and the
 * analysis Web Worker (worker/analyze.worker.ts).
 *
 * The worker is the ONLY place the heavy TS engine runs, so the UI thread stays
 * responsive even on large folders / repos. All analysis happens locally in the
 * browser; nothing is ever sent over the network by this protocol.
 */
import type { AnalysisResult } from "@aicodecheck/detector-core";

/** Analyze a single pasted snippet. */
export interface AnalyzeSnippetRequest {
  id: number;
  type: "snippet";
  code: string;
  filename?: string;
  language?: string | null;
}

/** Analyze a {path: content} map (files / folder / zip / github). */
export interface AnalyzeFilesRequest {
  id: number;
  type: "files";
  files: Record<string, string>;
}

export type WorkerRequest = AnalyzeSnippetRequest | AnalyzeFilesRequest;

export interface WorkerSuccess {
  id: number;
  ok: true;
  result: AnalysisResult;
}

export interface WorkerFailure {
  id: number;
  ok: false;
  error: string;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;
