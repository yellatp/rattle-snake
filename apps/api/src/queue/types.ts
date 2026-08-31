export type JobType = "committee" | "generate" | "resume_ab";

export interface QueueJob {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  tenantId: string;
  attempts: number;
  maxAttempts: number;
}

export interface Queue {
  enqueue(job: QueueJob): Promise<void>;
  dequeue(): Promise<QueueJob | null>;
  complete(job: QueueJob): Promise<void>;
  fail(job: QueueJob, error: string): Promise<void>;
  size(): Promise<number>;
  /** Move jobs stranded in the in-flight state (e.g. after a crash) back to the queue. */
  recover(): Promise<void>;
  close(): Promise<void>;
}

export interface QueueHandler {
  (job: QueueJob): Promise<void>;
}
