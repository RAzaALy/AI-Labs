// Which chat model answers. Same rules as the course's shared/llm.ts:
// LLM_PROVIDER if set, else the first provider with an API key, else a deterministic mock.
import type { LanguageModel } from 'ai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { groundedMockModel } from './mock-model';

export type Provider = 'google' | 'anthropic' | 'mock';

const MODELS = { google: 'gemini-3.5-flash-lite', anthropic: 'claude-haiku-5-5' } as const;
const KEYS = { google: 'GOOGLE_GENERATIVE_AI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;

export function provider(): Provider {
  const wanted = process.env.LLM_PROVIDER?.trim();
  if (wanted === 'mock') return 'mock';
  if (wanted && wanted in KEYS) return wanted as Provider;
  return (Object.keys(KEYS) as (keyof typeof KEYS)[]).find((p) => process.env[KEYS[p]]?.trim()) ?? 'mock';
}

export function chatModel(): { model: LanguageModel; modelId: string; provider: Provider } {
  const p = provider();
  if (p === 'mock') return { model: groundedMockModel(), modelId: 'mock-grounded', provider: p };
  return { model: p === 'google' ? google(MODELS.google) : anthropic(MODELS.anthropic), modelId: MODELS[p], provider: p };
}
