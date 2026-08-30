import type { JobEvent } from "@rattlesnake/shared";
import type { Redis } from "ioredis";
import type { EventBus } from "./types.js";

const CHANNEL_PREFIX = "rattle-snake:events:";

export class RedisEventBus implements EventBus {
  private subscriber: Redis;
  private publisher: Redis;
  private localListeners = new Map<string, Set<(event: JobEvent) => void>>();
  private subscribedJobs = new Set<string>();

  constructor(redis: { subscriber: Redis; publisher: Redis }) {
    this.subscriber = redis.subscriber;
    this.publisher = redis.publisher;
    this.subscriber.on("message", (channel, message) => {
      const jobId = channel.slice(CHANNEL_PREFIX.length);
      try {
        const event = JSON.parse(message) as JobEvent;
        this.notifyLocal(jobId, event);
      } catch {
        // Malformed messages are ignored.
      }
    });
  }

  private notifyLocal(jobId: string, event: JobEvent): void {
    const listeners = this.localListeners.get(jobId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[redis-event-bus] listener threw:", err);
      }
    }
  }

  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void {
    let listeners = this.localListeners.get(jobId);
    if (!listeners) {
      listeners = new Set();
      this.localListeners.set(jobId, listeners);
    }
    listeners.add(listener);

    if (!this.subscribedJobs.has(jobId)) {
      this.subscribedJobs.add(jobId);
      this.subscriber.subscribe(`${CHANNEL_PREFIX}${jobId}`).catch((err) => {
        console.error(`[redis-event-bus] subscribe failed for ${jobId}:`, err);
      });
    }

    return () => {
      listeners!.delete(listener);
      if (listeners!.size === 0) {
        this.localListeners.delete(jobId);
        this.subscribedJobs.delete(jobId);
        this.subscriber.unsubscribe(`${CHANNEL_PREFIX}${jobId}`).catch((err) => {
          console.error(`[redis-event-bus] unsubscribe failed for ${jobId}:`, err);
        });
      }
    };
  }

  publish(event: JobEvent): void {
    this.notifyLocal(event.jobId, event);
    this.publisher.publish(`${CHANNEL_PREFIX}${event.jobId}`, JSON.stringify(event)).catch((err) => {
      console.error("[redis-event-bus] publish failed:", err);
    });
  }
}
