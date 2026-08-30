import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";
import { MemoryQueue } from "./memory.js";
import { RedisQueue } from "./redis.js";
import type { Queue } from "./types.js";

export function createQueue(config: AppConfig): Queue {
  if (config.queue.driver === "redis" && config.redis.enabled) {
    const queue = new RedisQueue(new Redis(config.redis.url!));
    void queue.recover().catch((err) => {
      console.error("[redis-queue] startup recovery failed:", err);
    });
    return queue;
  }
  return new MemoryQueue();
}
