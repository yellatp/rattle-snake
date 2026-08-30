import type { JobEvent } from "@rattlesnake/shared";

export interface EventBus {
  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void;
  publish(event: JobEvent): void;
}
