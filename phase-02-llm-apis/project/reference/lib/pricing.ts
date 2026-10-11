// USD per 1M tokens, verified 2026-10-11 (see the course's shared/pricing.ts for sources).
import type { LanguageModelUsage } from 'ai';

const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5, cacheRead: 0.03 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75, cacheRead: 0.075 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'gpt-6-luna': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'gpt-6.1-sol': { input: 2, output: 10, cacheRead: 0.1 },
};

export function price(modelId: string) {
  const p = PRICES[modelId];
  if (!p) throw new Error(`No price for ${modelId}`);
  return p;
}

export function costUSD(modelId: string, u: LanguageModelUsage): number {
  const p = price(modelId);
  const cached = u.inputTokenDetails?.cacheReadTokens ?? 0;
  const fresh = (u.inputTokens ?? 0) - cached;
  return (fresh * p.input + cached * p.cacheRead + (u.outputTokens ?? 0) * p.output) / 1e6;
}

/** Worst case for a request: every step resends the whole input and uses the full output cap. */
export function worstCaseUSD(modelId: string, inputTokens: number, maxOutputTokens: number, maxSteps: number): number {
  const p = price(modelId);
  return (maxSteps * (inputTokens * p.input + maxOutputTokens * p.output)) / 1e6;
}
