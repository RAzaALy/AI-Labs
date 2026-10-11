// Cost is a feature: meter every call, budget before you call, and know where hidden tokens go.
import { generateText, type LanguageModel } from 'ai';
import { getModel } from '../../../../shared/llm.ts';
import { costFromUsage, getPricing, type CostBreakdown, type UsageLike } from '../../../../shared/pricing.ts';

export class BudgetExceededError extends Error {}

export interface MeterEntry {
  label: string;
  model: string;
  usage: UsageLike;
  cost: CostBreakdown;
}

/** A per-request / per-session / per-tenant cost meter. Phase 2's chat UI shows one of these. */
export class CostMeter {
  readonly entries: MeterEntry[] = [];
  constructor(readonly budgetUSD = Infinity) {}

  record(model: string, usage: UsageLike, label = 'call'): CostBreakdown {
    const cost = costFromUsage(model, usage);
    this.entries.push({ label, model, usage, cost });
    return cost;
  }

  get totalUSD(): number {
    return this.entries.reduce((s, e) => s + e.cost.total, 0);
  }

  get remainingUSD(): number {
    return this.budgetUSD - this.totalUSD;
  }

  totals() {
    const t = { calls: this.entries.length, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, reasoningTokens: 0, usd: this.totalUSD };
    for (const { usage: u } of this.entries) {
      t.inputTokens += u.inputTokens ?? 0;
      t.cacheReadTokens += u.inputTokenDetails?.cacheReadTokens ?? 0;
      t.outputTokens += u.outputTokens ?? 0;
      t.reasoningTokens += u.outputTokenDetails?.reasoningTokens ?? 0;
    }
    return t;
  }

  byModel(): Record<string, { calls: number; usd: number }> {
    const out: Record<string, { calls: number; usd: number }> = {};
    for (const e of this.entries) {
      out[e.model] ??= { calls: 0, usd: 0 };
      out[e.model]!.calls++;
      out[e.model]!.usd += e.cost.total;
    }
    return out;
  }

  /** Pre-flight: refuse a call whose WORST case (all input + the full max output) would exceed the budget. */
  assertCanAfford(model: string, inputTokens: number, maxOutputTokens: number): void {
    const p = getPricing(model);
    const worst = (inputTokens * p.input + maxOutputTokens * p.output) / 1e6;
    if (worst > this.remainingUSD) {
      throw new BudgetExceededError(`Worst-case $${worst.toFixed(6)} exceeds remaining budget $${this.remainingUSD.toFixed(6)}`);
    }
  }
}

export type Diagnosis = 'empty-answer-reasoning' | 'truncated' | 'reasoning-heavy' | 'cache-hit';

/** Read a result the way an on-call engineer would. */
export function diagnoseUsage(r: { text: string; finishReason: string; usage: UsageLike }): Diagnosis[] {
  const out: Diagnosis[] = [];
  const reasoning = r.usage.outputTokenDetails?.reasoningTokens ?? 0;
  const output = r.usage.outputTokens ?? 0;
  if (r.finishReason === 'length') {
    // max_tokens covers thinking + answer: a small cap on a reasoning model can leave NOTHING for the answer.
    out.push(r.text.trim() === '' && reasoning > 0 ? 'empty-answer-reasoning' : 'truncated');
  }
  if (output > 0 && reasoning / output > 0.8) out.push('reasoning-heavy');
  if ((r.usage.inputTokenDetails?.cacheReadTokens ?? 0) > 0) out.push('cache-hit');
  return out;
}

/** Same question at different reasoning levels: what does "thinking" cost you? */
export async function compareReasoning(prompt: string, modelId: string, model: LanguageModel = getModel({ tier: 'smart' }).model) {
  const rows = [];
  for (const [label, opts] of [
    ['default, max 60', { maxOutputTokens: 60 }],
    ['low, max 60', { maxOutputTokens: 60, reasoning: 'low' as const }],
    ['default, max 1000', { maxOutputTokens: 1000 }],
  ] as const) {
    const r = await generateText({ model, prompt, ...opts });
    rows.push({ label, text: r.text, finishReason: r.finishReason, usage: r.usage, cost: costFromUsage(modelId, r.usage).total, diagnosis: diagnoseUsage(r) });
  }
  return rows;
}

/** Repeat calls that share a long stable prefix and watch the provider's (implicit) prompt cache. */
export async function cacheProbe(prefix: string, questions: string[], modelId: string, model: LanguageModel = getModel().model) {
  const meter = new CostMeter();
  const rows = [];
  for (const q of questions) {
    // Stable content FIRST (instructions + document), the variable question LAST, so the prefix is reusable.
    const r = await generateText({ model, instructions: `Answer from the document only, in one sentence.\n<doc>\n${prefix}\n</doc>`, prompt: q, maxOutputTokens: 80 });
    const withCache = meter.record(modelId, r.usage, q).total;
    const noCache = costFromUsage(modelId, { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }).total;
    rows.push({ question: q, inputTokens: r.usage.inputTokens ?? 0, cacheReadTokens: r.usage.inputTokenDetails.cacheReadTokens ?? 0, withCache, noCache });
  }
  return { rows, meter };
}
