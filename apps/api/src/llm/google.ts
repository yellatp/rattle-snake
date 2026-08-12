import { DEFAULT_MAX_TOKENS, type ChatOptions, type LLMEndpointConfig, type LLMClient } from "./types.js";
import { describeHttpError, withApiPath } from "./util.js";

/**
 * Google Gemini native adapter — `generateContent` (FR-6.4).
 * - Key is passed as a query parameter (`?key=`).
 * - Shared `system` prompt maps to `systemInstruction`.
 * - Response text is read from `candidates[0].content.parts[]`.
 */
export function createGoogleClient(cfg: LLMEndpointConfig): LLMClient {
  return {
    provider: cfg.provider,
    model: cfg.model,
    async complete(system, user, opts): Promise<string> {
      const url = new URL(
        withApiPath(cfg.baseUrl, `/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`),
      );
      url.searchParams.set("key", cfg.apiKey);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user" as const, parts: [{ text: user }] }],
          generationConfig: {
            temperature: opts?.temperature ?? cfg.temperature,
            maxOutputTokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
          },
        }),
      });

      if (!res.ok) throw new Error(await describeHttpError(res, cfg.provider));

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) throw new Error(`Empty LLM response from ${cfg.provider} model ${cfg.model}`);
      return text;
    },
  };
}

export type { ChatOptions };
