import { Redis } from "ioredis";
import type { Queue, QueueJob } from "./types.js";

const QUEUE_KEY = "rattle-snake:queue";
const PROCESSING_KEY = "rattle-snake:queue:processing";
const DEAD_LETTER_KEY = "rattle-snake:queue:dead";

/**
 * At-least-once delivery: dequeue atomically moves the payload to a processing
 * list (BRPOPLPUSH) so a crash mid-job does not lose the run; the payload is
 * acked (LREM) only on complete/fail. On boot, recover() requeues anything
 * still stranded in the processing list.
 */
export class RedisQueue implements Queue {
  private redis: Redis;
  private inFlight = new Map<string, string>();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async enqueue(job: QueueJob): Promise<void> {
    await this.redis.lpush(QUEUE_KEY, JSON.stringify(job));
  }

  async dequeue(): Promise<QueueJob | null> {
    const raw = await this.redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, 1);
    if (!raw) return null;
    const job = JSON.parse(raw) as QueueJob;
    this.inFlight.set(job.id, raw);
    return job;
  }

  async complete(job: QueueJob): Promise<void> {
    await this.removeInFlight(job);
  }

  async fail(job: QueueJob, error: string): Promise<void> {
    await this.removeInFlight(job);
    job.attempts += 1;
    if (job.attempts < job.maxAttempts) {
      await this.redis.lpush(QUEUE_KEY, JSON.stringify(job));
    } else {
      await this.redis.lpush(
        DEAD_LETTER_KEY,
        JSON.stringify({ job, error, failedAt: new Date().toISOString() }),
      );
    }
  }

  async recover(): Promise<void> {
    let recovered = 0;
    for (;;) {
      const raw = await this.redis.rpoplpush(PROCESSING_KEY, QUEUE_KEY);
      if (!raw) break;
      recovered += 1;
    }
    if (recovered > 0) {
      console.log(`[redis-queue] recovered ${recovered} in-flight job(s) after restart`);
    }
  }

  async size(): Promise<number> {
    return this.redis.llen(QUEUE_KEY);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  private async removeInFlight(job: QueueJob): Promise<void> {
    const raw = this.inFlight.get(job.id) ?? JSON.stringify(job);
    this.inFlight.delete(job.id);
    await this.redis.lrem(PROCESSING_KEY, 1, raw);
  }
}
