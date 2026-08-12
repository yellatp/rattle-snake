import type { AppConfig } from "../config.js";
import { createAnthropicClient } from "./anthropic.js";
import { createGoogleClient } from "./google.js";
import { createMockClient } from "./mock.js";
import { createOpenAICompatibleClient } from "./openaiCompatible.js";
import { CUSTOM_PRESET, PROVIDER_PRESETS, requiresModel, type ProviderPreset } from "./presets.js";
import type { LLMEndpointConfig, LLMClient } from "./types.js";

export type { ChatOptions, LLMClient } from "./types.js";
export { createMockClient } from "./mock.js";

function firstPresent(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

/**
 * Resolve the effective endpoint config for a provider preset:
 * env `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` override the preset;
 * otherwise fall back to preset defaults and the provider's standard key env
 * vars (FR-6.6). Fails fast with an actionable message when config is missing.
 */
export function resolveEndpointConfig(config: AppConfig, preset: ProviderPreset): LLMEndpointConfig {
  const provider = preset.provider;
  const baseUrl = config.llm.baseUrl || preset.baseUrl;
  if (!baseUrl) {
    throw new Error(
      `LLM_PROVIDER=${provider}: no base URL. Set LLM_BASE_URL (any OpenAI-compatible endpoint is accepted).`,
    );
  }

  const model = config.llm.model || preset.model;
  if (!model) {
    throw new Error(`LLM_PROVIDER=${provider}: LLM_MODEL must be set (this provider has no default).`);
  }

  const apiKey = config.llm.apiKey || firstPresent(...preset.keyEnv) || "";
  if (!apiKey && preset.requiresKey) {
    const sources = preset.keyEnv.length > 0 ? preset.keyEnv.join(" or ") : "LLM_API_KEY";
    throw new Error(
      `LLM_PROVIDER=${provider}: missing API key. Set LLM_API_KEY or ${sources}.`,
    );
  }

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    temperature: config.llm.temperature,
  };
}

/**
 * Provider factory (PRD FR-6.1/FR-6.2/FR-6.5). Known names use their native
 * adapter; anything else is treated as a custom OpenAI-compatible endpoint.
 */
export function createLLMClient(config: AppConfig): LLMClient {
  const name = config.llm.provider;
  const preset = PROVIDER_PRESETS[name];

  if (!preset) {
    const endpoint = resolveEndpointConfig(config, CUSTOM_PRESET);
    return createOpenAICompatibleClient({ ...endpoint, provider: name });
  }
  if (preset.compatible === "mock") return createMockClient();

  const endpoint = resolveEndpointConfig(config, preset);
  switch (preset.compatible) {
    case "anthropic":
      return createAnthropicClient(endpoint);
    case "google":
      return createGoogleClient(endpoint);
    case "openai":
    default:
      return createOpenAICompatibleClient(endpoint);
  }
}

export { PROVIDER_PRESETS, requiresModel, type LLMEndpointConfig };
