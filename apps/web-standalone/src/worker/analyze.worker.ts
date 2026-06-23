/**
 * Analysis Web Worker.
 *
 * Runs the shared TypeScript detector engine OFF the main thread so the UI never
 * freezes, even when analyzing large folders or whole repositories. The engine
 * is fully browser-safe and performs no network I/O — your code is analyzed
 * entirely inside this worker, in your own browser.
 */
import { analyzeSnippet, analyzeFiles } from "@aicodecheck/detector-core";
import type { WorkerRequest, WorkerResponse } from "../lib/protocol";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    let result;
    if (msg.type === "snippet") {
      result = analyzeSnippet(msg.code, {
        filename: msg.filename,
        language: msg.language ?? undefined,
      });
    } else {
      result = analyzeFiles(msg.files);
    }
    const response: WorkerResponse = { id: msg.id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
