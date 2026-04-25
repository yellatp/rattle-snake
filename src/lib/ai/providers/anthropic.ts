import type { AIRequest, AIResponse } from '../router';

export async function callAnthropic(
  request: AIRequest,
  apiKey: string,
  model: string
): Promise<AIResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as {
    content: Array<{ text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };
  return {
    text: data.content[0]?.text ?? '',
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
  };
}

export async function streamAnthropic(
  request: AIRequest,
  apiKey: string,
  model: string,
  onChunk: (chunk: string) => void
): Promise<{ tokensUsed: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      stream: true,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6)) as {
            type: string;
            delta?: { type: string; text?: string };
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
            onChunk(data.delta.text ?? '');
          }
          if (data.type === 'message_start' && data.usage) {
            inputTokens = data.usage.input_tokens ?? 0;
          }
          if (data.type === 'message_delta' && data.usage) {
            outputTokens = data.usage.output_tokens ?? 0;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }

  return { tokensUsed: inputTokens + outputTokens };
}
