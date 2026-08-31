import type { JobEvent } from "@rattlesnake/shared";
import { z } from "zod";

export const webhookEventSchema = z.enum([
  "job.created",
  "job.completed",
  "job.failed",
  "job.cancelled",
  "job.deleted",
  "resume.generated",
  "cover_letter.generated",
  "cold_email.generated",
  "interview.generated",
]);

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export interface Webhook {
  id: string;
  tenantId?: string;
  url: string;
  events: WebhookEvent[];
  /** True when a signing secret is configured; the secret itself is never returned. */
  hasSecret: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Internal shape used by the dispatcher; never serialized to API clients. */
export type WebhookWithSecret = Webhook & { secret?: string };

export interface WebhookInput {
  url: string;
  events: WebhookEvent[];
  secret?: string;
  isActive?: boolean;
}

export interface WebhookUpdateInput {
  url?: string;
  events?: WebhookEvent[];
  secret?: string;
  isActive?: boolean;
}
