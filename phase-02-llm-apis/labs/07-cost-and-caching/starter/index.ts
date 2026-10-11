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
    // TODO: cost = costFromUsage(model, usage); push { label, model, usage, cost }; return cost
    throw new Error('TODO: record');
}

  get totalUSD(): number {
    // TODO: sum of entry costs
    throw new Error('TODO: totalUSD');
}

  get remainingUSD(): number {
    return this.budgetUSD - this.totalUSD;
  }

  totals() {
    // TODO: { calls, inputTokens, cacheReadTokens, outputTokens, reasoningTokens, usd } summed over entries
    throw new Error('TODO: totals');
}

  byModel(): Record<string, { calls: number; usd: number }> {
    // TODO: { [model]: { calls, usd } }
    throw new Error('TODO: byModel');
}

  /** Pre-flight: refuse a call whose WORST case (all input + the full max output) would exceed the budget. */
  assertCanAfford(model: string, inputTokens: number, maxOutputTokens: number): void {
    // TODO: worst case = (inputTokens × input price + maxOutputTokens × output price) / 1e6 (use getPricing)
    //  throw new BudgetExceededError(...) if it exceeds remainingUSD
    throw new Error('TODO: assertCanAfford');
}
}

export type Diagnosis = 'empty-answer-reasoning' | 'truncated' | 'reasoning-heavy' | 'cache-hit';

/** Read a result the way an on-call engineer would. */
export function diagnoseUsage(r: { text: string; finishReason: string; usage: UsageLike }): Diagnosis[] {
  // TODO: return a list of findings:
  //  finishReason 'length' → 'empty-answer-reasoning' if the text is empty and reasoning tokens > 0, else 'truncated'
  //  reasoning / output > 0.8 → 'reasoning-heavy'
  //  cacheReadTokens > 0 → 'cache-hit'
  throw new Error('TODO: diagnoseUsage');
}

/** Same question at different reasoning levels: what does "thinking" cost you? */
export async function compareReasoning(prompt: string, modelId: string, model: LanguageModel = getModel({ tier: 'smart' }).model) {
  // TODO: run the same prompt three times and diagnose each:
  //  { maxOutputTokens: 60 } · { maxOutputTokens: 60, reasoning: 'low' } · { maxOutputTokens: 1000 }
  //  rows: { label, text, finishReason, usage, cost: costFromUsage(modelId, usage).total, diagnosis }
  void generateText;
  throw new Error('TODO: compareReasoning');
}

/** Repeat calls that share a long stable prefix and watch the provider's (implicit) prompt cache. */
export async function cacheProbe(prefix: string, questions: string[], modelId: string, model: LanguageModel = getModel().model) {
  // TODO: for each question: generateText with instructions = stable text + <doc>prefix</doc> FIRST, prompt = question LAST.
  //  Record in a CostMeter; also compute the no-cache cost (same tokens, no cache discount).
  //  rows: { question, inputTokens, cacheReadTokens, withCache, noCache }. Return { rows, meter }
  throw new Error('TODO: cacheProbe');
}
