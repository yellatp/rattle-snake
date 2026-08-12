import { DEFAULT_MAX_TOKENS, type ChatOptions, type LLMEndpointConfig, type LLMClient } from "./types.js";
import { describeHttpError, withApiPath } from "./util.js";

/**
 * Anthropic native adapter — Messages API (FR-6.3).
 * - Auth: `x-api-key` header + `anthropic-version`.
 * - The shared `system` prompt maps to the top-level `system` field.
 * - `max_tokens` is mandatory in Anthropic's API.
 */
export function createAnthropicClient(cfg: LLMEndpointConfig): LLMClient {
  return {
    provider: cfg.provider,
    model: cfg.model,
    async complete(system, user, opts): Promise<string> {
      const res = await fetch(withApiPath(cfg.baseUrl, "/v1/messages"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: opts?.temperature ?? cfg.temperature,
          system,
          messages: [{ role: "user" as const, content: user }],
        }),
      });

      if (!res.ok) throw new Error(await describeHttpError(res, cfg.provider));

      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = data.content?.find((block) => block.type === "text")?.text?.trim();
      if (!text) throw new Error(`Empty LLM response from ${cfg.provider} model ${cfg.model}`);
      return text;
    },
  };
}

export type { ChatOptions };
