import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { MODELS, EMBEDDER_DTYPE } from '../../../../shared/local-models.ts';

export type Vector = number[];

export function cosine(a: Vector, b: Vector): number {
  // TODO: dot(a, b) / (|a| * |b|). Throw on dimension mismatch.
  throw new Error('TODO: cosine');
}

// Provided: lazily create the embedding pipeline once (model downloads on first use, ~90 MB).
let extractor: Promise<FeatureExtractionPipeline> | undefined;
function getExtractor() {
  extractor ??= pipeline('feature-extraction', MODELS.embedder, { dtype: EMBEDDER_DTYPE });
  return extractor;
}

export async function embed(texts: string[]): Promise<Vector[]> {
  // TODO: const fx = await getExtractor();
  //       call fx(texts, { pooling: 'mean', normalize: true }) and return .tolist()
  void getExtractor;
  throw new Error('TODO: embed');
}

export interface Hit {
  doc: string;
  score: number;
}

export async function search(query: string, docs: string[], k = 3): Promise<Hit[]> {
  // TODO: embed query + docs in ONE batch call, score with cosine, sort desc, take k.
  throw new Error('TODO: search');
}

export async function similarityMatrix(texts: string[]): Promise<number[][]> {
  // TODO: NxN matrix of cosine similarities.
  throw new Error('TODO: similarityMatrix');
}
