/**
 * Shared LLM client contract. Every provider (OpenAI, Anthropic, Google,
 * DeepSeek, Kimi, Grok, GroQ, Qwen, Ollama, OpenRouter, custom/any
 * OpenAI-compatible, mock) implements this same interface so the committee
 * pipeline is 100% provider-agnostic (PRD FR-6.1).
 */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  /** Complete a single chat turn. System + user message in, string out. */
  complete(system: string, user: string, opts?: ChatOptions): Promise<string>;
  readonly provider: string;
  readonly model: string;
}

/** Resolved, provider-specific endpoint settings (after preset + env resolution). */
export interface LLMEndpointConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export const DEFAULT_MAX_TOKENS = 1200;
