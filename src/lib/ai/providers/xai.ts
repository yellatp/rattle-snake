import type { AIRequest, AIResponse } from '../router';

// xAI uses OpenAI-compatible API
export async function callXAI(
  request: AIRequest,
  apiKey: string,
  model: string
): Promise<AIResponse> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user',   content: request.userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { total_tokens: number };
  };
  return {
    text: data.choices[0]?.message?.content ?? '',
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

export async function streamXAI(
  request: AIRequest,
  apiKey: string,
  model: string,
  onChunk: (chunk: string) => void
): Promise<{ tokensUsed: number }> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      stream: true,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user',   content: request.userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let tokensUsed = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const data = JSON.parse(line.slice(6)) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const content = data.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
        if (data.usage?.total_tokens) tokensUsed = data.usage.total_tokens;
      } catch {
        // skip
      }
    }
  }

  return { tokensUsed };
}
