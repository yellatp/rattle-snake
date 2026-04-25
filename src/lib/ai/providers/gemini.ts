import type { AIRequest, AIResponse } from '../router';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function callGemini(
  request: AIRequest,
  apiKey: string,
  model: string
): Promise<AIResponse> {
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata?: { totalTokenCount?: number };
  };
  return {
    text: data.candidates[0]?.content?.parts[0]?.text ?? '',
    tokensUsed: data.usageMetadata?.totalTokenCount ?? 0,
  };
}

export async function streamGemini(
  request: AIRequest,
  apiKey: string,
  model: string,
  onChunk: (chunk: string) => void
): Promise<{ tokensUsed: number }> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let tokensUsed = 0;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const chunk = JSON.parse(json) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { totalTokenCount?: number };
        };
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) onChunk(text);
        if (chunk.usageMetadata?.totalTokenCount) {
          tokensUsed = chunk.usageMetadata.totalTokenCount;
        }
      } catch {
        // skip malformed chunk
      }
    }
  }

  return { tokensUsed };
}
