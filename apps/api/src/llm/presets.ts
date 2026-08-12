/**
 * Provider registry (PRD FR-6.2). Each preset encodes the native auth scheme,
 * message format, default base URL, and a sensible default model for the
 * provider. Standard provider env vars are consulted for API keys when
 * `LLM_API_KEY` is not set (FR-6.6).
 */
export type CompatibleKind = "openai" | "anthropic" | "google" | "mock";

export interface ProviderPreset {
  /** Registry key; also the value of `LLM_PROVIDER`. */
  provider: string;
  label: string;
  /** Wire format family this provider uses. */
  compatible: CompatibleKind;
  /** Default base URL (user-set LLM_BASE_URL wins). */
  baseUrl: string;
  /** Default model (user-set LLM_MODEL wins). Empty string = required. */
  model: string;
  /** Standard env vars checked for an API key after LLM_API_KEY. */
  keyEnv: string[];
  /** true for cloud providers (missing key => startup error); false for local. */
  requiresKey: boolean;
}

export const CUSTOM_PRESET: ProviderPreset = {
  provider: "custom",
  label: "Custom (any OpenAI-compatible endpoint)",
  compatible: "openai",
  baseUrl: "",
  model: "",
  keyEnv: ["LLM_API_KEY"],
  requiresKey: false,
};

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  custom: CUSTOM_PRESET,
  openai: {
    provider: "openai",
    label: "OpenAI",
    compatible: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyEnv: ["OPENAI_API_KEY"],
    requiresKey: true,
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    compatible: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    keyEnv: ["ANTHROPIC_API_KEY"],
    requiresKey: true,
  },
  google: {
    provider: "google",
    label: "Google Gemini",
    compatible: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-flash",
    keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    requiresKey: true,
  },
  deepseek: {
    provider: "deepseek",
    label: "DeepSeek",
    compatible: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyEnv: ["DEEPSEEK_API_KEY"],
    requiresKey: true,
  },
  kimi: {
    provider: "kimi",
    label: "Kimi (Moonshot)",
    compatible: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2-0905-preview",
    keyEnv: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    requiresKey: true,
  },
  grok: {
    provider: "grok",
    label: "Grok (xAI)",
    compatible: "openai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3-mini",
    keyEnv: ["XAI_API_KEY", "GROK_API_KEY"],
    requiresKey: true,
  },
  groq: {
    provider: "groq",
    label: "Groq",
    compatible: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyEnv: ["GROQ_API_KEY"],
    requiresKey: true,
  },
  qwen: {
    provider: "qwen",
    label: "Qwen (Alibaba DashScope)",
    compatible: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    keyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    requiresKey: true,
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    compatible: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    keyEnv: ["OPENROUTER_API_KEY"],
    requiresKey: true,
  },
  ollama: {
    provider: "ollama",
    label: "Ollama (local)",
    compatible: "openai",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
    keyEnv: [],
    requiresKey: false,
  },
  vllm: {
    provider: "vllm",
    label: "vLLM (local)",
    compatible: "openai",
    baseUrl: "http://localhost:8000/v1",
    model: "",
    keyEnv: [],
    requiresKey: false,
  },
  lmstudio: {
    provider: "lmstudio",
    label: "LM Studio (local)",
    compatible: "openai",
    baseUrl: "http://localhost:1234/v1",
    model: "",
    keyEnv: [],
    requiresKey: false,
  },
  localai: {
    provider: "localai",
    label: "LocalAI (local)",
    compatible: "openai",
    baseUrl: "http://localhost:8080/v1",
    model: "",
    keyEnv: [],
    requiresKey: false,
  },
  mock: {
    provider: "mock",
    label: "Offline mock (tests / demos)",
    compatible: "mock",
    baseUrl: "",
    model: "mock-response-1",
    keyEnv: [],
    requiresKey: false,
  },
};

/** Providers with no model default (LLM_MODEL becomes mandatory). */
export function requiresModel(preset: ProviderPreset): boolean {
  return preset.model === "";
}
