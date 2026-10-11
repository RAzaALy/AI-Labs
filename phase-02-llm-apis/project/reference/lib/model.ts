// Which model serves a request. Same selection rules as the course's shared/llm.ts:
// LLM_PROVIDER if set, else the first provider with an API key, else a deterministic mock.
import type { EmbeddingModel, LanguageModel } from 'ai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { intentMockModel } from './mock-model';

export type Tier = 'fast' | 'smart';
type Provider = 'google' | 'anthropic' | 'openai' | 'mock';

const MODELS: Record<Exclude<Provider, 'mock'>, Record<Tier, string>> = {
  google: { fast: 'gemini-3.5-flash-lite', smart: 'gemini-3.8-flash' },
  anthropic: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' },
  openai: { fast: 'gpt-6-luna', smart: 'gpt-6.1-sol' },
};
const KEYS: Record<Exclude<Provider, 'mock'>, string> = { google: 'GOOGLE_GENERATIVE_AI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

export function provider(): Provider {
  const wanted = process.env.LLM_PROVIDER?.trim();
  if (wanted === 'mock') return 'mock';
  if (wanted && wanted in KEYS) return wanted as Provider;
  return (Object.keys(KEYS) as Exclude<Provider, 'mock'>[]).find((p) => process.env[KEYS[p]]?.trim()) ?? 'mock';
}

export function resolveModel(tier: Tier): { model: LanguageModel; modelId: string; provider: Provider } {
  const p = provider();
  if (p === 'mock') return { model: intentMockModel(), modelId: tier === 'fast' ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash', provider: p }; // mock prices like Gemini
  const modelId = MODELS[p][tier];
  const model = p === 'google' ? google(modelId) : p === 'anthropic' ? anthropic(modelId) : openai(modelId);
  return { model, modelId, provider: p };
}

/** Embeddings for knowledge-base search: Gemini when available, otherwise a deterministic hashed bag-of-words. */
export function embeddingModel(): EmbeddingModel {
  if (provider() === 'google') return google.embedding('gemini-embedding-2');
  return new MockEmbeddingModelV4({ doEmbed: async ({ values }) => ({ embeddings: values.map(hashEmbedding), warnings: [] }) });
}

const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'be', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'how', 'what', 'when', 'do', 'does', 'i', 'my', 'it', 'at', 'by', 'with']);

/** Deterministic toy embedding for offline runs: hashed bag of (non-stop) words in 512 dims, normalized. */
function hashEmbedding(text: string): number[] {
  const v = new Array(512).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (STOPWORDS.has(w)) continue;
    let h = 2166136261;
    for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    v[(h >>> 0) % 512] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
