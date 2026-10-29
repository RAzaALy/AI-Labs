// Embeddings: Gemini (768 dims, task types) with a key; local MiniLM (384 dims, CPU) otherwise.
import { embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { provider } from './model';

export interface Embedder {
  id: string;
  dims: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;
const g = globalThis as unknown as { __minilm?: Promise<Extractor> };

function local(): Embedder {
  const fx = () =>
    (g.__minilm ??= (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      if (process.env.MODEL_CACHE_DIR) env.cacheDir = process.env.MODEL_CACHE_DIR;
      return (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })) as unknown as Extractor;
    })());
  const run = async (texts: string[]) => {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 32) out.push(...(await (await fx())(texts.slice(i, i + 32), { pooling: 'mean', normalize: true })).tolist());
    return out;
  };
  return { id: 'minilm-l6-v2-384', dims: 384, embedDocuments: run, embedQuery: async (t) => (await run([t]))[0]! };
}

// Gemini's free tier allows ~100 embedded texts per minute; pace ourselves instead of collecting 429s.
const sent: { at: number; n: number }[] = [];
async function pace(n: number, perMinute = 90) {
  for (;;) {
    while (sent.length && Date.now() - sent[0]!.at > 60_000) sent.shift();
    if (sent.reduce((s, x) => s + x.n, 0) + n <= perMinute) break;
    await new Promise((r) => setTimeout(r, 60_000 - (Date.now() - sent[0]!.at) + 50));
  }
  sent.push({ at: Date.now(), n });
}

function gemini(dims = 768): Embedder {
  const model = google.embedding('gemini-embedding-2');
  const call = async (values: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY') => {
    const out: number[][] = [];
    for (let i = 0; i < values.length; i += 50) {
      await pace(Math.min(50, values.length - i));
      out.push(...(await embedMany({ model, values: values.slice(i, i + 50), providerOptions: { google: { outputDimensionality: dims, taskType } }, maxRetries: 6 })).embeddings);
    }
    return out;
  };
  return { id: `gemini-embedding-2-${dims}`, dims, embedDocuments: (t) => call(t, 'RETRIEVAL_DOCUMENT'), embedQuery: async (t) => (await call([t], 'RETRIEVAL_QUERY'))[0]! };
}

export const getEmbedder = (): Embedder => (provider() === 'google' ? gemini() : local());
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;
