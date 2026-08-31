import type { Envelope } from "@rattlesnake/shared";

/**
 * Plug-and-play I/O (design plan R4). Adapters translate external data into
 * the pipeline (InputAdapter) or deliver envelopes to external targets
 * (OutputAdapter). New integrations (job boards, ATS posters, browser
 * extension endpoints) become a new file plus registration - no core changes.
 */

export type InputKind = "jd_url" | "jd_file" | "jd_text" | "resume_file";

export interface AdapterInput {
  value: string;
}

export interface AdapterResult {
  ok: boolean;
  text?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface InputAdapter {
  id: string;
  kinds: InputKind[];
  fetch(input: AdapterInput): Promise<AdapterResult>;
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface AdapterTarget {
  url: string;
  secret?: string;
}

export interface OutputAdapter {
  id: string;
  kind: "webhook" | "export_bundle" | string;
  deliver(envelope: Envelope, target: AdapterTarget): Promise<DeliveryResult>;
}

const inputAdapters = new Map<string, InputAdapter>();
const outputAdapters = new Map<string, OutputAdapter>();

export function registerInputAdapter(adapter: InputAdapter): void {
  inputAdapters.set(adapter.id, adapter);
}

export function registerOutputAdapter(adapter: OutputAdapter): void {
  outputAdapters.set(adapter.id, adapter);
}

export function getInputAdapter(id: string): InputAdapter | undefined {
  return inputAdapters.get(id);
}

export function getOutputAdapter(id: string): OutputAdapter | undefined {
  return outputAdapters.get(id);
}

export function listInputAdapters(): InputAdapter[] {
  return [...inputAdapters.values()];
}

export function listOutputAdapters(): OutputAdapter[] {
  return [...outputAdapters.values()];
}

export function resetAdapters(): void {
  inputAdapters.clear();
  outputAdapters.clear();
}
