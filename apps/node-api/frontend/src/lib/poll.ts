import { api } from "../api";
import type { AnalysisResult, JobResponse } from "../types";

export interface PollProgress {
  status: string;
  progress: number;
  message?: string;
}

const TERMINAL_DONE = new Set(["completed", "complete", "succeeded", "success", "done", "finished"]);
const TERMINAL_FAIL = new Set(["failed", "error", "cancelled", "canceled"]);

/**
 * Poll a job until it reaches a terminal state, then fetch the resulting
 * report. Invokes onProgress on each tick. Throws on failure.
 */
export async function pollJobToReport(
  jobId: string,
  onProgress: (p: PollProgress) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<AnalysisResult> {
  const interval = opts.intervalMs ?? 1500;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (opts.signal?.aborted) throw new Error("Polling cancelled");

    let job: JobResponse;
    try {
      job = await api.getJob(jobId);
    } catch (e) {
      throw new Error(`Failed to read job status: ${(e as Error).message}`);
    }

    const status = (job.status ?? "").toLowerCase();
    onProgress({
      status: job.status ?? "pending",
      progress: typeof job.progress === "number" ? job.progress : 0,
    });

    if (TERMINAL_FAIL.has(status)) {
      throw new Error(job.error || `Job ${status}`);
    }

    if (TERMINAL_DONE.has(status)) {
      const reportId = job.analysis_id ?? jobId;
      return api.getReport(reportId);
    }

    await delay(interval, opts.signal);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}
