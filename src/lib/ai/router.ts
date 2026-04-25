import type { AIProvider } from '../../store/app';
import { callAnthropic, streamAnthropic } from './providers/anthropic';
import { callOpenAI, streamOpenAI } from './providers/openai';
import { callXAI, streamXAI } from './providers/xai';
import { callDeepSeek, streamDeepSeek } from './providers/deepseek';
import { callGemini, streamGemini } from './providers/gemini';
import { callKimi, streamKimi } from './providers/kimi';
import { callQwen, streamQwen } from './providers/qwen';

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface AIResponse {
  text: string;
  tokensUsed: number;
}

export interface GenerateResumeInput {
  templateContent: string;
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  tone: 'conservative' | 'balanced' | 'aggressive';
  lockedSections: string[];
  role: string;
  matchedKeywords?: string[];
  missingKeywords?: string[];
}

export interface ProviderSettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastError;
}

function routeCall(request: AIRequest, settings: ProviderSettings): Promise<AIResponse> {
  const { provider, apiKey, model } = settings;
  switch (provider) {
    case 'anthropic': return callAnthropic(request, apiKey, model);
    case 'openai':    return callOpenAI(request, apiKey, model);
    case 'xai':       return callXAI(request, apiKey, model);
    case 'deepseek':  return callDeepSeek(request, apiKey, model);
    case 'gemini':    return callGemini(request, apiKey, model);
    case 'kimi':      return callKimi(request, apiKey, model);
    case 'qwen':      return callQwen(request, apiKey, model);
  }
}

function routeStream(
  request: AIRequest,
  settings: ProviderSettings,
  onChunk: (chunk: string) => void
): Promise<{ tokensUsed: number }> {
  const { provider, apiKey, model } = settings;
  switch (provider) {
    case 'anthropic': return streamAnthropic(request, apiKey, model, onChunk);
    case 'openai':    return streamOpenAI(request, apiKey, model, onChunk);
    case 'xai':       return streamXAI(request, apiKey, model, onChunk);
    case 'deepseek':  return streamDeepSeek(request, apiKey, model, onChunk);
    case 'gemini':    return streamGemini(request, apiKey, model, onChunk);
    case 'kimi':      return streamKimi(request, apiKey, model, onChunk);
    case 'qwen':      return streamQwen(request, apiKey, model, onChunk);
  }
}

export async function generateResume(
  input: GenerateResumeInput,
  settings: ProviderSettings,
  systemPrompt: string
): Promise<AIResponse> {
  const request: AIRequest = { systemPrompt, userPrompt: buildUserPrompt(input) };
  return withRetry(() => routeCall(request, settings));
}

export async function streamGenerateResume(
  input: GenerateResumeInput,
  settings: ProviderSettings,
  systemPrompt: string,
  onChunk: (chunk: string) => void
): Promise<{ tokensUsed: number }> {
  const request: AIRequest = { systemPrompt, userPrompt: buildUserPrompt(input) };
  return withRetry(() => routeStream(request, settings, onChunk));
}

export async function streamGeneric(
  request: AIRequest,
  settings: ProviderSettings,
  onChunk: (chunk: string) => void
): Promise<{ tokensUsed: number }> {
  return withRetry(() => routeStream(request, settings, onChunk));
}

export async function callGeneric(
  request: AIRequest,
  settings: ProviderSettings
): Promise<AIResponse> {
  return withRetry(() => routeCall(request, settings));
}

function buildUserPrompt(input: GenerateResumeInput): string {
  const toneMap = {
    conservative: 'Use precise, measured language. Emphasize proven experience and stability.',
    balanced:     'Use confident, clear language. Balance achievements with responsibilities.',
    aggressive:   'Use bold, achievement-focused language. Quantify impact aggressively.',
  };

  return `
Rewrite the following resume for this job opportunity.

## Job Details
Company: ${input.companyName}
Title: ${input.jobTitle}
Tone: ${input.tone} — ${toneMap[input.tone]}

## Job Description
${input.jobDescription}

## Current Resume (JSON)
${input.templateContent}

## ATS Gap Analysis (Pre-computed — act on this first)
${(input.missingKeywords && input.missingKeywords.length > 0) ? `
MISSING from current resume — embed as many of these as possible (target ≥80%):
${input.missingKeywords.join(', ')}

ALREADY MATCHED — these are present; do NOT paraphrase them away:
${(input.matchedKeywords ?? []).join(', ')}

In your <thinking> block:
1. Go through each MISSING keyword one by one
2. Mark ✓ when you've embedded it naturally (bullet, skill item, or summary phrase)
3. Only embed where truthfully applicable to the candidate's experience
4. Confirm you hit ≥80% of missing keywords before outputting JSON
`.trim() : `Extract keywords from the job description below and embed 70-85% naturally.`}

## Instructions
- Preserve ALL metrics, numbers, percentages, and dollar amounts exactly as written
- Do NOT modify experience entries where "locked" is true — copy them verbatim
- Do NOT modify these section types: ${input.lockedSections.length > 0 ? input.lockedSections.join(', ') : 'none'}
- Return ONLY the raw JSON object — no headings, no "## Output JSON", no markdown fences, no explanation before or after
- The very first character of your response must be "{" and the last must be "}"
`.trim();
}
