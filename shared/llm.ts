// One place that decides WHICH model your code talks to. Labs import getModel() and never
// hardcode a provider, so the same code runs on Gemini's free tier, Claude, OpenAI, Groq,
// OpenRouter or a deterministic mock (for offline / CI runs).
//
// Selection order:
//   1. LLM_PROVIDER from the environment (google | groq | openrouter | anthropic | openai | mock)
//   2. otherwise the first provider that has an API key, in this order: google → groq → openrouter → anthropic → openai
//   3. otherwise 'mock'
import 'dotenv/config';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { groq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';
import { echoMock } from './mock-model.ts';

export type ProviderName = 'google' | 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'mock';
export type Tier = 'fast' | 'smart';

/**
 * Default model per provider and tier. Verified 2026-10-11.
 * fast  = cheap, low-latency, no hidden reasoning tokens (best for free-tier quotas)
 * smart = stronger reasoning; may spend hidden "thinking" tokens (billed as output)
 * Groq/OpenRouter catalogues change weekly, so set LLM_MODEL for those explicitly.
 */
export const DEFAULT_MODELS: Record<Exclude<ProviderName, 'mock'>, Partial<Record<Tier, string>>> = {
  google: { fast: 'gemini-3.5-flash-lite', smart: 'gemini-3.8-flash' },
  anthropic: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' },
  openai: { fast: 'gpt-6-luna', smart: 'gpt-6.1-sol' },
  groq: {},
  openrouter: {},
};

const KEY_ENV: Record<Exclude<ProviderName, 'mock'>, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

const hasKey = (p: Exclude<ProviderName, 'mock'>) => Boolean(process.env[KEY_ENV[p]]?.trim());

export function resolveProvider(): ProviderName {
  const wanted = process.env.LLM_PROVIDER?.trim() as ProviderName | undefined;
  if (wanted) {
    if (wanted !== 'mock' && !(wanted in KEY_ENV)) throw new Error(`Unknown LLM_PROVIDER "${wanted}"`);
    if (wanted !== 'mock' && !hasKey(wanted)) {
      throw new Error(`LLM_PROVIDER=${wanted} but ${KEY_ENV[wanted]} is empty. Add it to .env or set LLM_PROVIDER=mock.`);
    }
    return wanted;
  }
  return (['google', 'groq', 'openrouter', 'anthropic', 'openai'] as const).find(hasKey) ?? 'mock';
}

export const isMock = () => resolveProvider() === 'mock';

export interface ResolvedModel {
  model: LanguageModel;
  provider: ProviderName;
  modelId: string;
}

export function getModel(opts: { tier?: Tier; provider?: ProviderName; modelId?: string; mock?: LanguageModel } = {}): ResolvedModel {
  const provider = opts.provider ?? resolveProvider();
  if (provider === 'mock') {
    return { model: opts.mock ?? echoMock(), provider, modelId: 'mock' };
  }
  const tier = opts.tier ?? 'fast';
  const modelId = opts.modelId ?? (process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider][tier]);
  if (!modelId) throw new Error(`No default "${tier}" model for ${provider}; set LLM_MODEL in .env (e.g. a current model id from the provider's catalogue).`);
  const model: LanguageModel = {
    google: () => google(modelId),
    anthropic: () => anthropic(modelId),
    openai: () => openai(modelId),
    groq: () => groq(modelId),
    openrouter: () => createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(modelId),
  }[provider]();
  return { model, provider, modelId };
}

/** Embedding model for the active provider (Gemini only for now; mock otherwise). */
export function getEmbeddingModel(): { model: EmbeddingModel; modelId: string } {
  if (resolveProvider() === 'google') return { model: google.embedding('gemini-embedding-2'), modelId: 'gemini-embedding-2' };
  return { model: new MockEmbeddingModelV4({ doEmbed: async ({ values }) => ({ embeddings: values.map(hashEmbedding), warnings: [] }) }), modelId: 'mock-hash-embedding' };
}

const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'be', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'how', 'what', 'when', 'do', 'does', 'i', 'my', 'it', 'at', 'by', 'with']);

/** Deterministic toy embedding for offline runs: hashed bag of (non-stop) words in 512 dims, normalized. */
export function hashEmbedding(text: string): number[] {
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

export function describeModel(m: ResolvedModel): string {
  return m.provider === 'mock' ? 'mock model (no API calls: set a key in .env to go live)' : `${m.provider}/${m.modelId}`;
}

export { MockLanguageModelV4 };
