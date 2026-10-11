import { AutoTokenizer, type PreTrainedTokenizer } from '@huggingface/transformers';
import { getEncoding } from 'js-tiktoken';
import { MODELS } from '../../../../shared/local-models.ts';
import { costUSD } from '../../../../shared/pricing.ts';

export type TokenizerName = 'gpt2' | 'o200k';

const o200k = getEncoding('o200k_base');
let gpt2: PreTrainedTokenizer | undefined;
async function getGpt2() {
  gpt2 ??= await AutoTokenizer.from_pretrained(MODELS.gpt2Tokenizer);
  return gpt2;
}

async function encode(text: string, tokenizer: TokenizerName): Promise<number[]> {
  if (tokenizer === 'o200k') return o200k.encode(text);
  // add_special_tokens=false: count only the text, not BOS/EOS markers.
  return (await getGpt2()).encode(text, { add_special_tokens: false });
}

export async function countTokens(text: string): Promise<Record<TokenizerName, number>> {
  return { gpt2: (await encode(text, 'gpt2')).length, o200k: (await encode(text, 'o200k')).length };
}

export async function tokenPieces(text: string, tokenizer: TokenizerName): Promise<string[]> {
  const ids = await encode(text, tokenizer);
  if (tokenizer === 'o200k') return ids.map((id) => o200k.decode([id]));
  const tok = await getGpt2();
  return ids.map((id) => tok.decode([id]));
}

export async function charsPerToken(text: string, tokenizer: TokenizerName): Promise<number> {
  return text.length / (await encode(text, tokenizer)).length;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  return costUSD(model, inputTokens, outputTokens);
}

/** Cost of a month of traffic: requests/day × 30 days, each with the given token profile. */
export function monthlyCost(model: string, requestsPerDay: number, inputTokens: number, outputTokens: number): number {
  return estimateCost(model, inputTokens, outputTokens) * requestsPerDay * 30;
}
