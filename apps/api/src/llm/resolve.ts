import type { LlmOverride } from "@rattlesnake/shared";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import { createLLMClient, type LLMClient } from "./client.js";

/** The per-request LLM selection accepted by every LLM-backed endpoint. */
export interface LlmRequestInput {
  llm?: LlmOverride;
  llmConnectionId?: string;
}

export interface LlmResolution {
  client: LLMClient;
  error?: string;
}

/**
 * Resolve which LLM client serves a request. LLM configuration lives in
 * Settings (stored connections, one optionally marked default); the web app no
 * longer sends per-run LLM selections. Precedence:
 *
 *   1. an explicit saved `llmConnectionId`,
 *   2. an inline `llm` override (key over the wire, never stored),
 *   3. the Settings default connection when one is marked,
 *   4. the server's env-configured client (mock when unconfigured).
 */
export function resolveLlmClientForRequest(
  store: JobStore,
  config: AppConfig,
  fallback: LLMClient,
  body: LlmRequestInput,
  tenantId?: string,
): LlmResolution {
  const hasInline = body.llm !== undefined && Object.keys(body.llm).length > 0;
  if (hasInline && body.llmConnectionId) {
    return { client: fallback, error: "Provide either `llm` or `llmConnectionId`, not both." };
  }

  let llmConfig = config.llm;
  let buildClient = false;

  if (body.llmConnectionId) {
    const conn = store.getLlmConnectionWithKey(body.llmConnectionId, tenantId);
    if (!conn) {
      return { client: fallback, error: "LLM connection not found." };
    }
    buildClient = true;
    llmConfig = {
      ...config.llm,
      provider: conn.provider,
      baseUrl: conn.baseUrl || config.llm.baseUrl,
      apiKey: conn.apiKey || config.llm.apiKey || "",
      model: conn.model || config.llm.model,
      temperature: conn.temperature ?? config.llm.temperature,
    };
  } else if (hasInline) {
    buildClient = true;
    llmConfig = {
      ...config.llm,
      ...body.llm,
      // A user who supplies an endpoint/key but no provider name gets the
      // generic OpenAI-compatible client instead of silently falling back
      // to the server's default provider (which may be the offline mock).
      provider:
        body.llm!.provider ??
        (config.llm.provider !== "mock" ? config.llm.provider : "custom"),
    };
  } else {
    const def = store.getDefaultLlmConnectionWithKey(tenantId);
    if (def) {
      buildClient = true;
      llmConfig = {
        ...config.llm,
        provider: def.provider,
        baseUrl: def.baseUrl || config.llm.baseUrl,
        apiKey: def.apiKey || config.llm.apiKey || "",
        model: def.model || config.llm.model,
        temperature: def.temperature ?? config.llm.temperature,
      };
    }
  }

  if (buildClient) {
    try {
      return { client: createLLMClient({ ...config, llm: llmConfig }) };
    } catch (err) {
      return { client: fallback, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { client: fallback };
}
