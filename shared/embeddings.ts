// One embedding interface for every RAG lab.
//   • default / mock: all-MiniLM-L6-v2 running locally (384 dims, keyless, deterministic, CPU)
//   • live with a Gemini key: gemini-embedding-2 at 768 dims (Matryoshka-truncated, so pgvector can index it)
// Queries and documents are embedded differently on purpose: many models are ASYMMETRIC and expect
// a "query" vs "document" task type. Getting this wrong silently costs recall.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { MODELS, EMBEDDER_DTYPE } from './local-models.ts';
import { resolveProvider } from './llm.ts';

export interface Embedder {
  /** Stable id: store it next to every vector. Vectors from different embedders are NOT comparable. */
  id: string;
  dims: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let local: Promise<FeatureExtractionPipeline> | undefined;

export function localEmbedder(): Embedder {
  const fx = () => (local ??= pipeline('feature-extraction', MODELS.embedder, { dtype: EMBEDDER_DTYPE }));
  const run = async (texts: string[]) => {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const batch = await (await fx())(texts.slice(i, i + 32), { pooling: 'mean', normalize: true });
      out.push(...(batch.tolist() as number[][]));
    }
    return out;
  };
  return { id: 'minilm-l6-v2-384', dims: 384, embedDocuments: run, embedQuery: async (t) => (await run([t]))[0]! };
}

/**
 * Client-side pacing: the Gemini free tier allows ~100 embedding requests per minute, and EVERY text in a
 * batch counts as one request. Stay under the limit instead of collecting 429s.
 */
function rateLimiter(perMinute: number) {
  const sent: number[] = [];
  return async (n: number) => {
    for (;;) {
      const now = Date.now();
      while (sent.length && now - sent[0]! > 60_000) sent.shift();
      if (sent.length + n <= perMinute) {
        for (let i = 0; i < n; i++) sent.push(now);
        return;
      }
      const waitMs = 60_000 - (now - sent[0]!) + 50;
      console.log(`   (embedding rate limit: waiting ${(waitMs / 1000).toFixed(0)} s to stay under ${perMinute}/min)`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  };
}

export function geminiEmbedder(dims = 768): Embedder {
  const model = google.embedding('gemini-embedding-2');
  const take = rateLimiter(90);
  const call = async (values: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY') => {
    const out: number[][] = [];
    for (let i = 0; i < values.length; i += 50) {
      const batch = values.slice(i, i + 50);
      await take(batch.length);
      out.push(...(await embedMany({ model, values: batch, providerOptions: { google: { outputDimensionality: dims, taskType } }, maxRetries: 4 })).embeddings);
    }
    return out;
  };
  return {
    id: `gemini-embedding-2-${dims}`,
    dims,
    embedDocuments: (texts) => call(texts, 'RETRIEVAL_DOCUMENT'),
    embedQuery: async (t) => (await call([t], 'RETRIEVAL_QUERY'))[0]!,
  };
}

/**
 * Disk cache: same embedder + same text (+ query/document role) = same vector, so never pay twice.
 * Real ingestion pipelines do this too (keyed by content hash), which makes re-indexing cheap.
 */
export function cachedEmbedder(inner: Embedder, dir = path.join(repoRoot, '.cache', 'embeddings')): Embedder {
  const file = path.join(dir, `${inner.id}.json`);
  let cache: Map<string, number[]> | undefined;
  const load = () => {
    if (!cache) {
      cache = new Map(existsSync(file) ? Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, number[]>) : []);
    }
    return cache;
  };
  const save = () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(Object.fromEntries(load())));
  };
  const keyOf = (role: string, text: string) => createHash('sha256').update(`${role}\u0000${text}`).digest('hex');
  const embed = async (role: 'doc' | 'query', texts: string[], run: (t: string[]) => Promise<number[][]>) => {
    const c = load();
    const missing = [...new Set(texts.filter((t) => !c.has(keyOf(role, t))))];
    if (missing.length) {
      const vectors = await run(missing);
      missing.forEach((t, i) => c.set(keyOf(role, t), vectors[i]!));
      save();
    }
    return texts.map((t) => c.get(keyOf(role, t))!);
  };
  return {
    id: inner.id,
    dims: inner.dims,
    embedDocuments: (texts) => embed('doc', texts, (t) => inner.embedDocuments(t)),
    embedQuery: async (text) => (await embed('query', [text], async ([t]) => [await inner.embedQuery(t!)]))[0]!,
  };
}

/** Gemini when a Gemini key is configured and we're not in mock mode; the local model otherwise. Cached either way. */
export function getEmbedder(): Embedder {
  return cachedEmbedder(resolveProvider() === 'google' ? geminiEmbedder() : localEmbedder());
}

/** pgvector's text format: '[0.1,0.2,...]'. */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;
