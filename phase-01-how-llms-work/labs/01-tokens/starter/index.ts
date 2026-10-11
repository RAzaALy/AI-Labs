import { AutoTokenizer, type PreTrainedTokenizer } from '@huggingface/transformers';
import { getEncoding } from 'js-tiktoken';
import { MODELS } from '../../../../shared/local-models.ts';
import { costUSD } from '../../../../shared/pricing.ts';

export type TokenizerName = 'gpt2' | 'o200k';

// Provided: both tokenizers, loaded once.
const o200k = getEncoding('o200k_base');
let gpt2: PreTrainedTokenizer | undefined;
async function getGpt2() {
  gpt2 ??= await AutoTokenizer.from_pretrained(MODELS.gpt2Tokenizer);
  return gpt2;
}
void o200k, getGpt2, costUSD;

export async function countTokens(text: string): Promise<Record<TokenizerName, number>> {
  // TODO: return token counts for both tokenizers.
  // Hints: o200k.encode(text)   and   (await getGpt2()).encode(text, { add_special_tokens: false })
  throw new Error('TODO: countTokens');
}

export async function tokenPieces(text: string, tokenizer: TokenizerName): Promise<string[]> {
  // TODO: encode, then decode each id on its own to see the pieces.
  throw new Error('TODO: tokenPieces');
}

export async function charsPerToken(text: string, tokenizer: TokenizerName): Promise<number> {
  // TODO: text.length / number of tokens
  throw new Error('TODO: charsPerToken');
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // TODO: use costUSD() from shared/pricing.ts
  throw new Error('TODO: estimateCost');
}

export function monthlyCost(model: string, requestsPerDay: number, inputTokens: number, outputTokens: number): number {
  // TODO: per-request cost × requestsPerDay × 30
  throw new Error('TODO: monthlyCost');
}
