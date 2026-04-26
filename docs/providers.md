# AI Providers

Rattle-Snake supports 7 providers. All use BYOK — your key stays in the browser.

| Provider | Recommended Model | Notes |
| :--- | :--- | :--- |
| Anthropic (Claude) | claude-sonnet-4-6 | Best structured JSON output; extended thinking on Opus |
| OpenAI (GPT) | gpt-4o | Strong instruction-following |
| Google Gemini | gemini-2.0-flash | Fast, large context window |
| xAI (Grok) | grok-2-latest | Fast, good at technical roles |
| DeepSeek | deepseek-chat | Cost-effective, solid JSON output |
| Moonshot KIMI | moonshot-v1-128k | 128k context window |
| Alibaba Qwen | qwen-plus | Cost-effective, solid JSON |

Extended thinking models (`claude-opus-4-7`, `o1`) produce better keyword coverage but are slower and more expensive. Use them for final polish passes.

## Get your API key

| Provider | Key page |
| :--- | :--- |
| Anthropic | https://console.anthropic.com/account/keys |
| OpenAI | https://platform.openai.com/api-keys |
| Google Gemini | https://aistudio.google.com/app/apikey |
| xAI | https://console.x.ai/ |
| DeepSeek | https://platform.deepseek.com/api_keys |
| Moonshot KIMI | https://platform.moonshot.cn/console/api-keys |
| Alibaba Qwen | https://dashscope.console.aliyun.com/apiKey |
