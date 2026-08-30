import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";
import { MemoryEventBus } from "./memory.js";
import { RedisEventBus } from "./redis.js";
import type { EventBus } from "./types.js";

export function createEventBus(config: AppConfig): EventBus {
  if (config.redis.enabled) {
    const subscriber = new Redis(config.redis.url!);
    const publisher = new Redis(config.redis.url!);
    return new RedisEventBus({ subscriber, publisher });
  }
  return new MemoryEventBus();
}
