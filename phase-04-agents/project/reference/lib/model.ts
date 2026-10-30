// Which model drives the agent: LLM_PROVIDER if set, else the first provider with a key, else a scripted mock.
import { wrapLanguageModel, type LanguageModel } from 'ai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { mockOpsAgentModel } from './mock-model';

type Provider = 'google' | 'anthropic' | 'mock';
const MODELS = { google: 'gemini-3.5-flash-lite', anthropic: 'claude-haiku-5-5' } as const;
const KEYS = { google: 'GOOGLE_GENERATIVE_AI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;

export function provider(): Provider {
  const wanted = process.env.LLM_PROVIDER?.trim();
  if (wanted === 'mock') return 'mock';
  if (wanted && wanted in KEYS) return wanted as Provider;
  return (Object.keys(KEYS) as (keyof typeof KEYS)[]).find((p) => process.env[KEYS[p]]?.trim()) ?? 'mock';
}

// Free-tier pacing (Gemini flash-lite: 15 requests/minute). An agent step is a request, so one chat turn can be 5+.
const sent: number[] = [];
async function pace(rpm: number) {
  for (;;) {
    while (sent.length && Date.now() - sent[0]! >= 60_000) sent.shift();
    if (sent.length < rpm) return void sent.push(Date.now());
    await new Promise((r) => setTimeout(r, 60_000 - (Date.now() - sent[0]!) + 25));
  }
}

export function agentModel(): { model: LanguageModel; modelId: string } {
  const p = provider();
  if (p === 'mock') return { model: mockOpsAgentModel(), modelId: 'mock-ops-agent' };
  const base = p === 'google' ? google(MODELS.google) : anthropic(MODELS.anthropic);
  const rpm = Number(process.env.LLM_RPM ?? (p === 'google' ? 14 : 0));
  const model = rpm > 0 ? wrapLanguageModel({ model: base, middleware: { specificationVersion: 'v4', wrapGenerate: async ({ doGenerate }) => (await pace(rpm), doGenerate()), wrapStream: async ({ doStream }) => (await pace(rpm), doStream()) } }) : base;
  return { model, modelId: MODELS[p] };
}
