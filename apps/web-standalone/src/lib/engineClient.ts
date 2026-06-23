/**
 * Typed client wrapper around the analysis Web Worker.
 *
 * Exposes promise-returning `analyzeSnippet` / `analyzeFiles` functions that
 * bridge request/response messages with the worker. A monotonically increasing
 * request id is used to correlate each postMessage with its reply, so multiple
 * in-flight analyses never get crossed.
 *
 * The worker is created lazily and reused for the lifetime of the page. It is
 * instantiated with Vite's documented worker pattern so the worker (and the
 * engine it imports) is bundled correctly for static hosting:
 *
 *   new Worker(new URL("../worker/analyze.worker.ts", import.meta.url), { type: "module" })
 */
import type { AnalysisResult } from "@aicodecheck/detector-core";
import type { WorkerRequest, WorkerResponse } from "./protocol";

type Pending = {
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../worker/analyze.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new Error(msg.error));
  };
  worker.onerror = (event) => {
    // A fatal worker error rejects everything in flight.
    const message = event.message || "The analysis worker crashed.";
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(new Error(message));
    }
  };
  return worker;
}

type RequestBody =
  | Omit<Extract<WorkerRequest, { type: "snippet" }>, "id">
  | Omit<Extract<WorkerRequest, { type: "files" }>, "id">;

function send(req: RequestBody): Promise<AnalysisResult> {
  const id = nextId++;
  const message = { ...req, id } as WorkerRequest;
  return new Promise<AnalysisResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(message);
  });
}

/** Analyze a single snippet of pasted code (off the main thread). */
export function analyzeSnippet(
  code: string,
  opts: { filename?: string; language?: string | null } = {},
): Promise<AnalysisResult> {
  return send({
    type: "snippet",
    code,
    filename: opts.filename,
    language: opts.language ?? null,
  });
}

/** Analyze a {relativePath: content} map (files, folder, zip, or repo). */
export function analyzeFiles(
  files: Record<string, string>,
): Promise<AnalysisResult> {
  return send({ type: "files", files });
}

/** Tear down the worker (used on hot-reload / unmount; optional). */
export function disposeEngine(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
