// Local, keyless models via transformers.js (ONNX on CPU).
// Models download once from the Hugging Face Hub into ./.cache/models.
import { env } from '@huggingface/transformers';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(repoRoot, '.cache', 'models');

export const MODELS = {
  /** GPT-2 BPE tokenizer (50k vocab) — the classic byte-level BPE. */
  gpt2Tokenizer: 'Xenova/gpt2',
  /** 384-dim sentence embedding model (~90 MB in fp32). */
  embedder: 'Xenova/all-MiniLM-L6-v2',
  /** 135M-parameter instruction-tuned causal LM. Small enough for any laptop CPU. */
  tinyLm: 'HuggingFaceTB/SmolLM2-135M-Instruct',
} as const;

/**
 * Precision for the tiny LM. We use fp32 (~540 MB download) on purpose: the q8 ONNX export uses
 * DYNAMIC activation quantization, whose scales are computed over the whole input — so the
 * next-token probability for the same prefix changed with what came after it (70% vs 34% in our
 * test). fp32 is exact and consistent. See theory/05-sampling.md, "a nondeterminism you can reproduce".
 */
export const TINY_LM_DTYPE = 'fp32' as const;

/** Same reason for the embedder: with q8, a sentence's vector shifted (cosine 0.989 vs itself) depending on what else was in the batch. */
export const EMBEDDER_DTYPE = 'fp32' as const;

export { env };
