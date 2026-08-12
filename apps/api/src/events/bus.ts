import type { JobEvent } from "@rattlesnake/shared";

type Listener = (event: JobEvent) => void;

/**
 * In-process pub/sub bus used to stream live debate events to SSE subscribers.
 *
 * One isolated channel per job id. Suitable for a self-hosted single-process
 * deployment. For multi-process/scale-out, swap this for Redis pub/sub
 * (see docs/roadmap.md).
 */
class EventBus {
  private channels = new Map<string, Set<Listener>>();

  subscribe(jobId: string, listener: Listener): () => void {
    let listeners = this.channels.get(jobId);
    if (!listeners) {
      listeners = new Set();
      this.channels.set(jobId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners!.delete(listener);
      if (listeners!.size === 0) this.channels.delete(jobId);
    };
  }

  publish(event: JobEvent): void {
    const listeners = this.channels.get(event.jobId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[bus] listener threw:", err);
      }
    }
  }
}

export const bus = new EventBus();
