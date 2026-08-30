import { DEFAULT_MAX_TOKENS, type ChatOptions, type LLMEndpointConfig, type LLMClient } from "./types.js";
import { describeHttpError, fetchLlm, withApiPath } from "./util.js";

/**
 * Generic OpenAI-compatible adapter (FR-6.2/FR-6.5). Used by OpenAI, DeepSeek,
 * Kimi, Grok, GroQ, Qwen, OpenRouter, Ollama, vLLM, LM Studio, LocalAI, and any
 * user-defined provider that speaks `/chat/completions`.
 */
export function createOpenAICompatibleClient(cfg: LLMEndpointConfig): LLMClient {
  return {
    provider: cfg.provider,
    model: cfg.model,
    async complete(system, user, opts): Promise<string> {
      const res = await fetchLlm(
        withApiPath(cfg.baseUrl, "/chat/completions"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: opts?.temperature ?? cfg.temperature,
            max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        },
        cfg.provider,
      );

      if (!res.ok) throw new Error(await describeHttpError(res, cfg.provider));

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error(`Empty LLM response from ${cfg.provider} model ${cfg.model}`);
      return text;
    },
  };
}

export type { ChatOptions };
