import { getEncoding } from 'js-tiktoken';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const enc = getEncoding('o200k_base');

/** Chat formats wrap every message in special tokens (role markers, separators). ~4 tokens is a common estimate. */
export const PER_MESSAGE_OVERHEAD = 4;

export function messageTokens(m: Message): number {
  return enc.encode(m.content).length + PER_MESSAGE_OVERHEAD;
}

export function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

export interface BudgetOptions {
  contextWindow: number;
  /** Space reserved for the model's answer (= max_tokens). Input + output must fit the window. */
  reserveForOutput: number;
}

export interface BudgetResult {
  kept: Message[];
  dropped: Message[];
  inputTokens: number;
}

/**
 * Sliding-window policy: always keep the system prompt and the latest message,
 * drop the OLDEST other messages until the input fits (window - reserved output).
 */
export function fitToBudget(messages: Message[], opts: BudgetOptions): BudgetResult {
  const budget = opts.contextWindow - opts.reserveForOutput;
  const system = messages[0]?.role === 'system' ? [messages[0]] : [];
  const rest = messages.slice(system.length);
  const last = rest.pop();
  if (!last) return { kept: system, dropped: [], inputTokens: totalTokens(system) };

  const pinned = totalTokens([...system, last]);
  if (pinned > budget) {
    throw new Error(`system prompt + latest message need ${pinned} tokens but the input budget is ${budget}`);
  }

  // Walk backwards from newest, keeping what fits; everything older is dropped.
  let used = pinned;
  let cut = rest.length;
  while (cut > 0 && used + messageTokens(rest[cut - 1]!) <= budget) {
    used += messageTokens(rest[cut - 1]!);
    cut--;
  }
  return { kept: [...system, ...rest.slice(cut), last], dropped: rest.slice(0, cut), inputTokens: used };
}

/**
 * Stateless APIs mean every turn re-sends the whole history.
 * Given the tokens ADDED per turn, return input tokens billed per turn and in total.
 */
export function conversationInputTokens(tokensAddedPerTurn: number[]): { perTurn: number[]; total: number } {
  let history = 0;
  const perTurn = tokensAddedPerTurn.map((t) => (history += t));
  return { perTurn, total: perTurn.reduce((a, b) => a + b, 0) };
}
