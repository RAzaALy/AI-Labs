import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Tensor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from '@huggingface/transformers';
import { MODELS, TINY_LM_DTYPE } from '../../../../shared/local-models.ts';
import { seededRandom } from '../../../../shared/rng.ts';

// ---------- Part 1: pure sampling math ----------

/** Softmax with temperature. T=0 → greedy (one-hot on the argmax). */
export function softmax(logits: number[], temperature = 1): number[] {
  // TODO:
  //  - if temperature === 0 return a one-hot array at argmax(logits)
  //  - divide each logit by temperature
  //  - subtract the max before Math.exp (numerical stability, try without it on [1000, 1001])
  //  - normalize so the result sums to 1
  throw new Error('TODO: softmax');
}

export function argmax(xs: number[]): number {
  // TODO: index of the largest element
  throw new Error('TODO: argmax');
}

/** Keep only the k most likely tokens (k<=0 means "off"), then renormalize. */
export function topK(probs: number[], k: number): number[] {
  throw new Error('TODO: topK');
}

/** Keep the smallest set of top tokens whose cumulative probability ≥ p, then renormalize. */
export function topP(probs: number[], p: number): number[] {
  throw new Error('TODO: topP');
}

/** Draw an index from `probs` using one call to rand() (uniform in [0,1)). */
export function sampleIndex(probs: number[], rand: () => number): number {
  // Hint: walk the array subtracting probabilities from r until r < 0.
  throw new Error('TODO: sampleIndex');
}

// ---------- Part 2: drive a real 135M-parameter LLM (provided plumbing) ----------

let loaded: Promise<{ tok: PreTrainedTokenizer; model: PreTrainedModel }> | undefined;
export function loadModel() {
  loaded ??= (async () => ({
    tok: await AutoTokenizer.from_pretrained(MODELS.tinyLm),
    model: await AutoModelForCausalLM.from_pretrained(MODELS.tinyLm, { dtype: TINY_LM_DTYPE }),
  }))();
  return loaded;
}

/** Provided: one forward pass → logits for the NEXT token (last position). */
export async function nextTokenLogits(ids: number[]): Promise<number[]> {
  const { model } = await loadModel();
  const shape = [1, ids.length];
  const input_ids = new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), shape);
  const attention_mask = new Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape);
  const { logits } = await model({ input_ids, attention_mask });
  const [, seq, vocab] = logits.dims as [number, number, number];
  return Array.from((logits.data as Float32Array).subarray((seq - 1) * vocab, seq * vocab));
}

export async function topCandidates(prompt: string, n = 5, temperature = 1) {
  // TODO: encode the prompt, get next-token logits, softmax with temperature,
  //       return the n most likely { token: tok.decode([id]), p }.
  throw new Error('TODO: topCandidates');
}

export interface GenerateOptions {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  seed?: number;
}

export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  // TODO: the autoregressive loop.
  //  ids = tok.encode(prompt); rand = seededRandom(seed)
  //  repeat maxTokens times: logits → softmax(T) → topK → topP → sampleIndex → stop on tok.eos_token_id → push
  //  return only the generated part: tok.decode(newIds, { skip_special_tokens: true })
  void seededRandom;
  throw new Error('TODO: generate');
}

export async function renderChat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> {
  // TODO: tok.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true })
  throw new Error('TODO: renderChat');
}
