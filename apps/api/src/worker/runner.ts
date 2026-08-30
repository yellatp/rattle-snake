import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import type { EventBus } from "../events/types.js";
import type { LLMClient } from "../llm/client.js";
import type { Queue, QueueHandler, QueueJob } from "../queue/types.js";
import { runCommittee } from "../committee/runner.js";
import { runGenerateChain } from "../committee/generateChain.js";
export interface WorkerContext {
  store: JobStore;
  llm: LLMClient;
  config: AppConfig;
  bus: EventBus;
}

export class Worker {
  private queue: Queue;
  private ctx: WorkerContext;
  private concurrency: number;
  private handlers = new Map<string, QueueHandler>();
  private running = false;
  private active = new Set<Promise<void>>();

  constructor(queue: Queue, ctx: WorkerContext, concurrency = 4) {
    this.queue = queue;
    this.ctx = ctx;
    this.concurrency = concurrency;
  }

  register(type: string, handler: QueueHandler): void {
    this.handlers.set(type, handler);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (let i = 0; i < this.concurrency; i++) {
      void this.loop();
    }
  }

  /** Stop accepting new jobs and wait (bounded) for in-flight handlers to finish. */
  async stop(timeoutMs = 30_000): Promise<void> {
    this.running = false;
    const deadline = Date.now() + timeoutMs;
    while (this.active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (this.active.size > 0) {
      console.error(`[worker] stop timed out with ${this.active.size} job(s) still running`);
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let job: QueueJob | null;
      try {
        job = await this.queue.dequeue();
      } catch (err) {
        console.error("[worker] dequeue failed; retrying in 1s:", err);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      const handler = this.handlers.get(job.type);
      if (!handler) {
        try {
          await this.queue.fail(job, `No handler registered for type ${job.type}`);
        } catch (err) {
          console.error("[worker] queue.fail threw for unhandled job:", err);
        }
        continue;
      }
      const promise = this.runHandler(job, handler);
      this.active.add(promise);
      void promise.finally(() => this.active.delete(promise));
    }
  }

  private async runHandler(job: QueueJob, handler: QueueHandler): Promise<void> {
    try {
      await handler(job);
      await this.queue.complete(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] job ${job.id} (${job.type}) failed:`, message);
      try {
        await this.queue.fail(job, message);
      } catch (failErr) {
        console.error("[worker] queue.fail threw:", failErr);
      }
    }
  }
}

export function createDefaultWorker(queue: Queue, ctx: WorkerContext): Worker {
  const worker = new Worker(queue, ctx, ctx.config.queue.concurrency);

  worker.register("committee", async (job) => {
    const jobId = job.payload.jobId as string;
    await runCommittee(jobId, ctx.store, ctx.llm, ctx.config, ctx.bus);
  });

  worker.register("generate", async (job) => {
    const jobId = job.payload.jobId as string;
    const storeJob = ctx.store.get(jobId);
    if (!storeJob || !storeJob.generate) {
      throw new Error("Job not found or no generate options set");
    }
    await runGenerateChain(jobId, ctx.store, ctx.llm, storeJob.generate, ctx.bus);
  });

  return worker;
}
