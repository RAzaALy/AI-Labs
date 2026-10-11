// USD per 1M tokens. Verified 2026-10-10 against:
//   https://platform.claude.com/docs/en/about-claude/models/overview
//   https://developers.openai.com/api/docs/models
// Prices change; re-check before relying on them. Cache/batch discounts are covered in Phase 2.
export interface Pricing {
  input: number;
  output: number;
}

export const PRICING: Record<string, Pricing> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 }, // listed as "from" — the lowest tier
  'gpt-6-astra': { input: 10, output: 50 },
  'gpt-6.1-sol': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
};

export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) throw new Error(`No pricing for model "${model}". Known: ${Object.keys(PRICING).join(', ')}`);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
