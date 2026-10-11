import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { MODELS, EMBEDDER_DTYPE } from '../../../../shared/local-models.ts';

export type Vector = number[];

export function cosine(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

let extractor: Promise<FeatureExtractionPipeline> | undefined;
function getExtractor() {
  extractor ??= pipeline('feature-extraction', MODELS.embedder, { dtype: EMBEDDER_DTYPE });
  return extractor;
}

export async function embed(texts: string[]): Promise<Vector[]> {
  const fx = await getExtractor();
  // Mean pooling averages the per-token vectors into one sentence vector; normalize makes |v| = 1.
  const out = await fx(texts, { pooling: 'mean', normalize: true });
  return out.tolist() as Vector[];
}

export interface Hit {
  doc: string;
  score: number;
}

export async function search(query: string, docs: string[], k = 3): Promise<Hit[]> {
  const [q, ...d] = await embed([query, ...docs]);
  return d
    .map((v, i) => ({ doc: docs[i]!, score: cosine(q!, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function similarityMatrix(texts: string[]): Promise<number[][]> {
  const v = await embed(texts);
  return v.map((a) => v.map((b) => cosine(a, b)));
}
