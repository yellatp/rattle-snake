import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { createAnthropicClient } from "./anthropic.js";
import { createGoogleClient } from "./google.js";
import { createOpenAICompatibleClient } from "./openaiCompatible.js";
import { PROVIDER_PRESETS } from "./presets.js";
import { createLLMClient } from "./client.js";
import type { LLMEndpointConfig } from "./types.js";

const cfg = (overrides: Partial<LLMEndpointConfig> = {}): LLMEndpointConfig => ({
  provider: "test-provider",
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  model: "test-model",
  temperature: 0.3,
  ...overrides,
});

function mockFetchOnce(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setEnv(pairs: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(pairs)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const TOUCHED_ENV = [
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MOONSHOT_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "DASHSCOPE_API_KEY",
  "OPENROUTER_API_KEY",
];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of TOUCHED_ENV) delete process.env[key];
});

describe("OpenAI-compatible adapter", () => {
  it("posts to /chat/completions with system+user and returns trimmed content", async () => {
    const fetch = mockFetchOnce({ choices: [{ message: { content: "  [STRONG HIRE] ok  " } }] });
    const client = createOpenAICompatibleClient(cfg());
    const text = await client.complete("sys", "user", { temperature: 0.7, maxTokens: 500 });

    expect(text).toBe("[STRONG HIRE] ok");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(500);
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "user" },
    ]);
  });

  it("defaults max_tokens to 1200", async () => {
    const fetch = mockFetchOnce({ choices: [{ message: { content: "x" } }] });
    await createOpenAICompatibleClient(cfg()).complete("s", "u");
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).max_tokens).toBe(1200);
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    mockFetchOnce({ error: "invalid api key" }, 401);
    await expect(createOpenAICompatibleClient(cfg()).complete("s", "u")).rejects.toThrow(
      /HTTP 401/,
    );
  });

  it("throws when the response has no text", async () => {
    mockFetchOnce({ choices: [{ message: { content: "   " } }] });
    await expect(createOpenAICompatibleClient(cfg()).complete("s", "u")).rejects.toThrow(
      /Empty LLM response/,
    );
  });
});

describe("Anthropic adapter", () => {
  it("posts to /v1/messages with x-api-key, top-level system, and parses text", async () => {
    const fetch = mockFetchOnce({
      content: [{ type: "text", text: "  claude verdict  " }],
    });
    const client = createAnthropicClient(cfg({ baseUrl: "https://api.anthropic.com" }));
    const text = await client.complete("sys-prompt", "user-turn");

    expect(text).toBe("claude verdict");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.system).toBe("sys-prompt");
    expect(body.messages).toEqual([{ role: "user", content: "user-turn" }]);
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(1200);
    expect(body.temperature).toBe(0.3);
  });

  it("does not double-prefix /v1 when the base URL already ends in /v1", async () => {
    mockFetchOnce({ content: [{ type: "text", text: "ok" }] });
    await createAnthropicClient(cfg()).complete("s", "u");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://example.test/v1/messages");
  });

  it("throws on non-2xx", async () => {
    mockFetchOnce({ error: "unauthorized" }, 401);
    await expect(createAnthropicClient(cfg()).complete("s", "u")).rejects.toThrow(/HTTP 401/);
  });
});

describe("Google Gemini adapter", () => {
  it("posts to :generateContent with systemInstruction and key param", async () => {
    const fetch = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: " part-a " }, { text: "part-b " }] } }],
    });
    const client = createGoogleClient(cfg({ baseUrl: "https://generativelanguage.googleapis.com" }));
    const text = await client.complete("sys", "user", { maxTokens: 512 });

    expect(text).toBe("part-a part-b");
    const url = String(fetch.mock.calls[0][0]);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent?key=test-key",
    );
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "user" }] }]);
    expect(body.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 512 });
  });

  it("throws on non-2xx", async () => {
    mockFetchOnce({ error: "forbidden" }, 403);
    await expect(createGoogleClient(cfg()).complete("s", "u")).rejects.toThrow(/HTTP 403/);
  });
});

describe("provider registry (FR-6.2)", () => {
  it("ships a preset for every must-have provider + generic fallbacks", () => {
    for (const name of [
      "custom",
      "openai",
      "anthropic",
      "google",
      "deepseek",
      "kimi",
      "grok",
      "groq",
      "qwen",
      "openrouter",
      "ollama",
      "vllm",
      "lmstudio",
      "localai",
      "mock",
    ]) {
      expect(PROVIDER_PRESETS[name], `missing preset: ${name}`).toBeDefined();
    }
  });

  it("gives cloud providers a default model and requires a key; local providers do not", () => {
    for (const name of ["openai", "anthropic", "google", "deepseek", "kimi", "grok", "groq", "qwen", "openrouter"]) {
      const preset = PROVIDER_PRESETS[name]!;
      expect(preset.model, `${name} model`).toBeTruthy();
      expect(preset.requiresKey, `${name} requiresKey`).toBe(true);
      expect(preset.keyEnv.length, `${name} keyEnv`).toBeGreaterThan(0);
    }
    expect(PROVIDER_PRESETS["ollama"]!.requiresKey).toBe(false);
  });

  it("knows the wire format family of each provider", () => {
    expect(PROVIDER_PRESETS["anthropic"]!.compatible).toBe("anthropic");
    expect(PROVIDER_PRESETS["google"]!.compatible).toBe("google");
    expect(PROVIDER_PRESETS["openai"]!.compatible).toBe("openai");
    expect(PROVIDER_PRESETS["grok"]!.compatible).toBe("openai");
    expect(PROVIDER_PRESETS["qwen"]!.compatible).toBe("openai");
    expect(PROVIDER_PRESETS["mock"]!.compatible).toBe("mock");
  });
});

describe("createLLMClient dispatch (FR-6.1/FR-6.5/FR-6.6)", () => {
  it("LLM_PROVIDER=mock returns the offline mock client", () => {
    setEnv({ LLM_PROVIDER: "mock" });
    const llm = createLLMClient(loadConfig());
    expect(llm.provider).toBe("mock");
    expect(llm.model).toBe("mock-response-1");
  });

  it("LLM_PROVIDER=ollama resolves the local preset without any env overrides", async () => {
    setEnv({ LLM_PROVIDER: "ollama" });
    const fetch = mockFetchOnce({ choices: [{ message: { content: "ok" } }] });
    const llm = createLLMClient(loadConfig());
    expect(llm.provider).toBe("ollama");
    expect(llm.model).toBe("llama3.1");
    await llm.complete("s", "u");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("http://localhost:11434/v1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ");
  });

  it("an unknown provider name falls back to OpenAI-compatible with the given base URL", async () => {
    setEnv({
      LLM_PROVIDER: "acme",
      LLM_BASE_URL: "https://acme.test/v1",
      LLM_API_KEY: "sk-acme",
      LLM_MODEL: "acme-7b",
    });
    const fetch = mockFetchOnce({ choices: [{ message: { content: "ok" } }] });
    const llm = createLLMClient(loadConfig());
    expect(llm.provider).toBe("acme");
    expect(llm.model).toBe("acme-7b");
    await llm.complete("s", "u");
    expect(String(fetch.mock.calls[0][0])).toBe("https://acme.test/v1/chat/completions");
  });

  it("falls back to the provider's standard key env var when LLM_API_KEY is unset", () => {
    setEnv({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk-openai", LLM_MODEL: "gpt-x" });
    const fetch = mockFetchOnce({ choices: [{ message: { content: "ok" } }] });
    const llm = createLLMClient(loadConfig());
    expect(llm.model).toBe("gpt-x");
    return llm.complete("s", "u").then(() => {
      const init = fetch.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-openai");
    });
  });

  it("throws an actionable error when a cloud provider has no key", () => {
    setEnv({ LLM_PROVIDER: "anthropic" });
    expect(() => createLLMClient(loadConfig())).toThrow(/LLM_API_KEY or ANTHROPIC_API_KEY/);
  });

  it("throws an actionable error when a custom provider has no base URL", () => {
    setEnv({ LLM_PROVIDER: "custom", LLM_MODEL: "m" });
    expect(() => createLLMClient(loadConfig())).toThrow(/LLM_BASE_URL/);
  });

  it("throws an actionable error when a provider has no model default and LLM_MODEL is unset", () => {
    setEnv({ LLM_PROVIDER: "vllm" });
    expect(() => createLLMClient(loadConfig())).toThrow(/LLM_MODEL/);
  });

  it("LLM_BASE_URL overrides the preset base URL", async () => {
    setEnv({
      LLM_PROVIDER: "grok",
      LLM_BASE_URL: "https://proxy.example/v1",
      XAI_API_KEY: "sk-xai",
      LLM_MODEL: "grok-3",
    });
    const fetch = mockFetchOnce({ choices: [{ message: { content: "ok" } }] });
    const llm = createLLMClient(loadConfig());
    await llm.complete("s", "u");
    expect(String(fetch.mock.calls[0][0])).toBe("https://proxy.example/v1/chat/completions");
  });
});
