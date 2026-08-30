import type { Queue, QueueJob } from "./types.js";

export class MemoryQueue implements Queue {
  private jobs: QueueJob[] = [];

  async enqueue(job: QueueJob): Promise<void> {
    this.jobs.push(job);
  }

  async dequeue(): Promise<QueueJob | null> {
    return this.jobs.shift() ?? null;
  }

  async complete(_job: QueueJob): Promise<void> {
    // No-op for in-memory queue.
  }

  async fail(job: QueueJob, error: string): Promise<void> {
    job.attempts += 1;
    if (job.attempts < job.maxAttempts) {
      this.jobs.push(job);
    } else {
      console.error(`[memory-queue] job ${job.id} permanently failed: ${error}`);
    }
  }

  async size(): Promise<number> {
    return this.jobs.length;
  }

  async recover(): Promise<void> {
    // In-flight jobs live only in process memory; nothing to recover on boot.
  }

  async close(): Promise<void> {
    this.jobs = [];
  }
}
