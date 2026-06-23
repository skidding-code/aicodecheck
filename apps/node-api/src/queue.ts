/**
 * Job-queue abstraction with two interchangeable backends:
 *
 *  - In-process Promise queue (default) — zero infrastructure, ideal for dev,
 *    tests and single-node use. Jobs run asynchronously without blocking the
 *    request that enqueued them.
 *  - BullMQ + Redis (when REDIS_URL is set) — durable, multi-worker, survives
 *    restarts. Loaded lazily so the app runs without bullmq/ioredis installed.
 *
 * Both run the same task functions from `tasks.ts`.
 */

import { getSettings, usingRedis } from "./config.js";
import {
  analyzeRepositoryTask,
  analyzeZipTask,
  type RepositoryTaskPayload,
  type ZipTaskPayload,
} from "./tasks.js";

export type TaskName = "repository" | "zip";

interface QueuedJob {
  name: TaskName;
  payload: RepositoryTaskPayload | ZipTaskPayload;
}

async function runTask(job: QueuedJob): Promise<void> {
  if (job.name === "repository") {
    await analyzeRepositoryTask(job.payload as RepositoryTaskPayload);
  } else {
    await analyzeZipTask(job.payload as ZipTaskPayload);
  }
}

// --------------------------------------------------------------------------- //
// In-process queue                                                            //
// --------------------------------------------------------------------------- //

class InProcessQueue {
  private running = 0;
  private readonly concurrency = 4;
  private readonly pending: QueuedJob[] = [];
  /** Resolves when no jobs are pending or running — handy for tests. */
  private idleResolvers: Array<() => void> = [];

  enqueue(job: QueuedJob): void {
    this.pending.push(job);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length) {
      const job = this.pending.shift()!;
      this.running++;
      void runTask(job)
        .catch((err) => {
          // Errors are already persisted to the job record by the task.
          // eslint-disable-next-line no-console
          console.error(`[queue] job failed (${job.name}):`, err?.message ?? err);
        })
        .finally(() => {
          this.running--;
          this.pump();
          if (this.running === 0 && this.pending.length === 0) {
            const r = this.idleResolvers;
            this.idleResolvers = [];
            r.forEach((fn) => fn());
          }
        });
    }
  }

  /** Wait until all enqueued jobs have settled. Test helper. */
  async drain(): Promise<void> {
    if (this.running === 0 && this.pending.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }
}

let _inproc: InProcessQueue | null = null;
function inproc(): InProcessQueue {
  if (!_inproc) _inproc = new InProcessQueue();
  return _inproc;
}

// --------------------------------------------------------------------------- //
// BullMQ queue (optional)                                                     //
// --------------------------------------------------------------------------- //

let _bull: {
  queue: { add(name: string, data: unknown): Promise<unknown> };
} | null = null;

async function getBull(): Promise<NonNullable<typeof _bull>> {
  if (_bull) return _bull;
  const { Queue, Worker } = (await import("bullmq" as string)) as unknown as {
    Queue: new (name: string, opts: unknown) => {
      add(name: string, data: unknown): Promise<unknown>;
    };
    Worker: new (
      name: string,
      processor: (job: { name: string; data: unknown }) => Promise<void>,
      opts: unknown,
    ) => unknown;
  };
  const connection = { url: getSettings().redisUrl! };
  const queue = new Queue("aipd", { connection });
  // Spawn an in-process worker so the API node can also process jobs. For a
  // dedicated worker deployment, run this module separately.
  new Worker(
    "aipd",
    async (job: { name: string; data: unknown }) => {
      await runTask({ name: job.name as TaskName, payload: job.data as never });
    },
    { connection },
  );
  _bull = { queue };
  return _bull;
}

// --------------------------------------------------------------------------- //

export async function enqueueRepository(
  payload: RepositoryTaskPayload,
): Promise<void> {
  if (usingRedis()) {
    const { queue } = await getBull();
    await queue.add("repository", payload);
  } else {
    inproc().enqueue({ name: "repository", payload });
  }
}

export async function enqueueZip(payload: ZipTaskPayload): Promise<void> {
  if (usingRedis()) {
    const { queue } = await getBull();
    await queue.add("zip", payload);
  } else {
    inproc().enqueue({ name: "zip", payload });
  }
}

/** Test helper: wait for the in-process queue to finish all jobs. */
export async function drainQueue(): Promise<void> {
  if (!usingRedis()) await inproc().drain();
}
