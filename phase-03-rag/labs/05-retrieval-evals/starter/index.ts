// Retrieval evaluation: measure the retriever on its own, before any LLM writes an answer.
import type { GoldenQuestion } from '../../../../shared/corpus.ts';

export interface Ref {
  file: string;
  section: string;
}
const key = (r: Ref) => `${r.file}::${r.section}`;

/**
 * Several chunks can come from the same section. Labels are per section, so collapse the ranked chunk
 * list into a ranked list of unique sections first; otherwise one section can "fill" the top-k.
 */
export function toSectionRanking(hits: Ref[]): Ref[] {
  // TODO: keep the first occurrence of each file::section, in order
  throw new Error('TODO: toSectionRanking');
}

/** Share of the relevant sections that appear in the top k. "Did we find it at all?" */
export function recallAtK(ranked: Ref[], relevant: Ref[], k: number): number {
  // TODO: |relevant ∩ top k| / |relevant|   (1 if there are no relevant items)
  throw new Error('TODO: recallAtK');
}

/** Share of the top k that is relevant. "How much noise do we send to the LLM?" */
export function precisionAtK(ranked: Ref[], relevant: Ref[], k: number): number {
  // TODO: |relevant ∩ top k| / |top k|
  throw new Error('TODO: precisionAtK');
}

/** 1 / rank of the first relevant result (0 if none). "How high is the first good answer?" */
export function reciprocalRank(ranked: Ref[], relevant: Ref[]): number {
  // TODO: 1 / (index of the first relevant + 1), or 0
  throw new Error('TODO: reciprocalRank');
}

/** nDCG@k with binary relevance: rewards relevant results more the higher they rank, normalised to [0, 1]. */
export function ndcgAtK(ranked: Ref[], relevant: Ref[], k: number): number {
  // TODO: DCG = Σ over top k of rel / log2(i + 2); divide by the ideal DCG for min(k, |relevant|) hits
  throw new Error('TODO: ndcgAtK');
}

export interface Metrics {
  recall1: number;
  recall3: number;
  recall5: number;
  precision3: number;
  mrr: number;
  ndcg5: number;
  queries: number;
}

export type Retriever = (query: string) => Promise<Ref[]>;

/** Run a retriever over the answerable golden questions and average every metric. */
export async function evaluateRetriever(retrieve: Retriever, questions: GoldenQuestion[]): Promise<Metrics & { byType: Record<string, number>; misses: string[] }> {
  // TODO: for every answerable question: ranked = toSectionRanking(await retrieve(q.query)); accumulate
  //  recall@1/3/5, precision@3, reciprocal rank, nDCG@5; recall@5 per question type; list questions with recall@5 < 1.
  throw new Error('TODO: evaluateRetriever');
}

/** A CI gate: fail loudly when quality drops below agreed thresholds. */
export function assertThresholds(m: Metrics, min: Partial<Record<keyof Metrics, number>>): string[] {
  // TODO: return "name value < min" for each metric below its threshold (value with 3 decimals)
  throw new Error('TODO: assertThresholds');
}
