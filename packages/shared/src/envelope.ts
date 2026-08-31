import { z } from "zod";

/**
 * The single integration contract for everything Rattle Snake emits or accepts
 * (design plan R4). Every outbound payload - webhook deliveries now, importer
 * and exporter adapters next - is wrapped in this envelope so external systems
 * can rely on one stable shape.
 */

export const ENVELOPE_SPEC = "rattle-snake.envelope.v1";

export interface Envelope<T = unknown> {
  spec: typeof ENVELOPE_SPEC;
  type: string;
  version: number;
  emittedAt: string;
  tenantId?: string;
  jobId?: string;
  payload: T;
}

export const envelopeSchema = z.object({
  spec: z.literal(ENVELOPE_SPEC),
  type: z.string().min(1),
  version: z.number().int().min(1),
  emittedAt: z.string().min(1),
  tenantId: z.string().optional(),
  jobId: z.string().optional(),
  payload: z.unknown(),
});

export function createEnvelope<T>(
  type: string,
  version: number,
  payload: T,
  context: { tenantId?: string; jobId?: string } = {},
): Envelope<T> {
  const envelope: Envelope<T> = {
    spec: ENVELOPE_SPEC,
    type,
    version,
    emittedAt: new Date().toISOString(),
    payload,
  };
  if (context.tenantId !== undefined) envelope.tenantId = context.tenantId;
  if (context.jobId !== undefined) envelope.jobId = context.jobId;
  return envelope;
}
