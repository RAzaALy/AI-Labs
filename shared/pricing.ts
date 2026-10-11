// USD per 1M tokens (standard tier). Verified 2026-10-11 against:
//   https://platform.claude.com/docs/en/about-claude/pricing
//   https://developers.openai.com/api/docs/pricing
//   https://ai.google.dev/gemini-api/docs/pricing
// Prices change; re-check before relying on them.
export interface Pricing {
  input: number;
  output: number; // includes hidden reasoning/"thinking" tokens
  /** Price for input tokens served from the provider's prompt cache. */
  cacheRead?: number;
  /** Price for writing a prompt into the cache (Anthropic 5-minute cache; others charge input price). */
  cacheWrite?: number;
  /** Multiplier for the asynchronous Batch API (0.5 = 50% off). */
  batch?: number;
  note?: string;
}

export const PRICING: Record<string, Pricing> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5, batch: 0.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, batch: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5, batch: 0.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, batch: 0.5, note: 'prompts ≤100k tokens; $0.50/$2.50 above' },
  'gpt-6-astra': { input: 10, output: 50, cacheRead: 1, batch: 0.5 },
  'gpt-6.1-sol': { input: 2, output: 10, cacheRead: 0.1, batch: 0.5 },
  'gpt-6-luna': { input: 0.1, output: 0.5, cacheRead: 0.01, batch: 0.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5, cacheRead: 0.03, batch: 0.5, note: 'free tier available' },
  'gemini-3.8-flash': { input: 0.75, output: 3.75, cacheRead: 0.075, batch: 0.5, note: 'free tier available; price doubles from 2027-01-01' },
  'gemini-embedding-2': { input: 0.2, output: 0, note: 'embeddings: input only' },
};

export function getPricing(model: string): Pricing {
  const p = PRICING[model];
  if (!p) throw new Error(`No pricing for model "${model}". Known: ${Object.keys(PRICING).join(', ')}`);
  return p;
}

/** Simple cost: all input at the base rate. (Phase 1 API.) */
export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const p = getPricing(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Usage shape returned by AI SDK 7 (`result.usage`). Only the fields we price are listed. */
export interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
}

export interface CostBreakdown {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  total: number;
}

/** Cost of one call from AI SDK usage, pricing cached input and reasoning tokens correctly. */
export function costFromUsage(model: string, usage: UsageLike, opts: { batch?: boolean } = {}): CostBreakdown {
  const p = getPricing(model);
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const freshInput = usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite);
  const output = usage.outputTokens ?? 0; // already includes reasoning tokens
  const m = opts.batch ? (p.batch ?? 1) : 1;
  const r = {
    input: (freshInput * p.input * m) / 1e6,
    cacheRead: (cacheRead * (p.cacheRead ?? p.input) * m) / 1e6,
    cacheWrite: (cacheWrite * (p.cacheWrite ?? p.input) * m) / 1e6,
    output: (output * p.output * m) / 1e6,
  };
  return { ...r, total: r.input + r.cacheRead + r.cacheWrite + r.output };
}
