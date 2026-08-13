/** Provider presets mirrored from apps/api/src/llm/presets.ts for the UI. */
export interface ProviderOption {
  value: string;
  label: string;
  baseUrl: string;
  model: string;
  requiresKey: boolean;
}

export const PROVIDERS: ProviderOption[] = [
  { value: "custom", label: "Custom (OpenAI-compatible)", baseUrl: "", model: "", requiresKey: false },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", requiresKey: true },
  { value: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5", requiresKey: true },
  { value: "google", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash", requiresKey: true },
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", requiresKey: true },
  { value: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2-0905-preview", requiresKey: true },
  { value: "grok", label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", model: "grok-3-mini", requiresKey: true },
  { value: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", requiresKey: true },
  { value: "qwen", label: "Qwen (Alibaba)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", requiresKey: true },
  { value: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", requiresKey: true },
  { value: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.1", requiresKey: false },
  { value: "vllm", label: "vLLM (local)", baseUrl: "http://localhost:8000/v1", model: "", requiresKey: false },
  { value: "lmstudio", label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", model: "", requiresKey: false },
  { value: "localai", label: "LocalAI (local)", baseUrl: "http://localhost:8080/v1", model: "", requiresKey: false },
];
