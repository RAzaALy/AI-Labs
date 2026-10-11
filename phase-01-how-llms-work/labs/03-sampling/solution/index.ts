import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Tensor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from '@huggingface/transformers';
import { MODELS, TINY_LM_DTYPE } from '../../../../shared/local-models.ts';
import { seededRandom } from '../../../../shared/rng.ts';

// ---------- Part 1: pure sampling math (this is all "temperature/top-p" is) ----------

/** Softmax with temperature. T=0 → greedy (one-hot on the argmax). */
export function softmax(logits: number[], temperature = 1): number[] {
  if (temperature === 0) {
    const best = argmax(logits);
    return logits.map((_, i) => (i === best ? 1 : 0));
  }
  const scaled = logits.map((z) => z / temperature);
  const max = Math.max(...scaled); // subtract max for numerical stability (exp overflow)
  const exps = scaled.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function argmax(xs: number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i]! > xs[best]!) best = i;
  return best;
}

function renormalize(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => p / sum);
}

/** Keep only the k most likely tokens. */
export function topK(probs: number[], k: number): number[] {
  if (k <= 0 || k >= probs.length) return probs;
  const threshold = [...probs].sort((a, b) => b - a)[k - 1]!;
  let kept = 0;
  return renormalize(probs.map((p) => (p >= threshold && kept++ < k ? p : 0)));
}

/** Nucleus sampling: keep the smallest set of top tokens whose cumulative probability ≥ p. */
export function topP(probs: number[], p: number): number[] {
  if (p >= 1) return probs;
  const order = probs.map((prob, i) => ({ prob, i })).sort((a, b) => b.prob - a.prob);
  const keep = new Set<number>();
  let cumulative = 0;
  for (const { prob, i } of order) {
    keep.add(i);
    cumulative += prob;
    if (cumulative >= p) break;
  }
  return renormalize(probs.map((prob, i) => (keep.has(i) ? prob : 0)));
}

/** Draw an index from a probability distribution using a [0,1) random number. */
export function sampleIndex(probs: number[], rand: () => number): number {
  let r = rand();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i]!;
    if (r < 0) return i;
  }
  return probs.length - 1; // floating-point leftovers
}

// ---------- Part 2: drive a real 135M-parameter LLM with your sampler ----------

let loaded: Promise<{ tok: PreTrainedTokenizer; model: PreTrainedModel }> | undefined;
export function loadModel() {
  loaded ??= (async () => ({
    tok: await AutoTokenizer.from_pretrained(MODELS.tinyLm),
    model: await AutoModelForCausalLM.from_pretrained(MODELS.tinyLm, { dtype: TINY_LM_DTYPE }),
  }))();
  return loaded;
}

/** One forward pass → logits for the NEXT token (the last position). */
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
  const { tok } = await loadModel();
  const probs = softmax(await nextTokenLogits(tok.encode(prompt)), temperature);
  return probs
    .map((p, id) => ({ token: tok.decode([id]), p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n);
}

export interface GenerateOptions {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  seed?: number;
}

/**
 * The autoregressive loop: predict → sample → append → repeat.
 * (No KV cache here, so we recompute the whole prefix every step. Real servers cache it.)
 */
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const { temperature = 1, topK: k = 0, topP: p = 1, maxTokens = 15, seed = 42 } = opts;
  const { tok } = await loadModel();
  const rand = seededRandom(seed);
  const ids = tok.encode(prompt);
  const promptLen = ids.length;
  const eos = tok.eos_token_id;
  for (let step = 0; step < maxTokens; step++) {
    let probs = softmax(await nextTokenLogits(ids), temperature);
    probs = topP(topK(probs, k), p);
    const next = sampleIndex(probs, rand);
    if (next === eos) break;
    ids.push(next);
  }
  return tok.decode(ids.slice(promptLen), { skip_special_tokens: true });
}

/** Bonus: a "chat" is just a string template with special tokens. See what the model really receives. */
export async function renderChat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> {
  const { tok } = await loadModel();
  return tok.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true }) as string;
}
