import type { JobEvent } from "@rattlesnake/shared";
import type { EventBus } from "./types.js";

const REPLAY_BUFFER_SIZE = 200;

export class MemoryEventBus implements EventBus {
  private channels = new Map<string, Set<(event: JobEvent) => void>>();
  private history = new Map<string, JobEvent[]>();

  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void {
    let listeners = this.channels.get(jobId);
    if (!listeners) {
      listeners = new Set();
      this.channels.set(jobId, listeners);
    }
    listeners.add(listener);

    // Replay recent events so late SSE subscribers don't miss live updates
    // that were published before they connected.
    const replay = this.history.get(jobId);
    if (replay) {
      for (const event of replay) {
        try {
          listener(event);
        } catch (err) {
          console.error("[event-bus] replay listener threw:", err);
        }
      }
    }

    return () => {
      listeners!.delete(listener);
      if (listeners!.size === 0) {
        this.channels.delete(jobId);
        this.history.delete(jobId);
      }
    };
  }

  publish(event: JobEvent): void {
    const buffer = this.history.get(event.jobId) ?? [];
    buffer.push(event);
    if (buffer.length > REPLAY_BUFFER_SIZE) buffer.shift();
    this.history.set(event.jobId, buffer);

    const listeners = this.channels.get(event.jobId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[event-bus] listener threw:", err);
      }
    }
  }
}
