import { getEncoding } from 'js-tiktoken';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const enc = getEncoding('o200k_base');
void enc;

/** Chat formats wrap every message in special tokens (role markers, separators). ~4 tokens is a common estimate. */
export const PER_MESSAGE_OVERHEAD = 4;

export function messageTokens(m: Message): number {
  // TODO: content tokens (enc.encode) + PER_MESSAGE_OVERHEAD
  throw new Error('TODO: messageTokens');
}

export function totalTokens(messages: Message[]): number {
  // TODO
  throw new Error('TODO: totalTokens');
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

export function fitToBudget(messages: Message[], opts: BudgetOptions): BudgetResult {
  // TODO: sliding-window policy
  //  - input budget = contextWindow - reserveForOutput
  //  - ALWAYS keep the system message (if messages[0] is one) and the LAST message
  //  - throw if those two alone exceed the budget
  //  - keep as many of the most RECENT other messages as fit; drop the oldest
  //  - preserve original order in `kept`
  throw new Error('TODO: fitToBudget');
}

export function conversationInputTokens(tokensAddedPerTurn: number[]): { perTurn: number[]; total: number } {
  // TODO: the API is stateless, so turn n bills the whole history so far (a running sum).
  throw new Error('TODO: conversationInputTokens');
}
