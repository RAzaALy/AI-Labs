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
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(key(h)) && seen.add(key(h)));
}

/** Share of the relevant sections that appear in the top k. "Did we find it at all?" */
export function recallAtK(ranked: Ref[], relevant: Ref[], k: number): number {
  if (relevant.length === 0) return 1;
  const top = new Set(ranked.slice(0, k).map(key));
  return relevant.filter((r) => top.has(key(r))).length / relevant.length;
}

/** Share of the top k that is relevant. "How much noise do we send to the LLM?" */
export function precisionAtK(ranked: Ref[], relevant: Ref[], k: number): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  const rel = new Set(relevant.map(key));
  return top.filter((h) => rel.has(key(h))).length / top.length;
}

/** 1 / rank of the first relevant result (0 if none). "How high is the first good answer?" */
export function reciprocalRank(ranked: Ref[], relevant: Ref[]): number {
  const rel = new Set(relevant.map(key));
  const i = ranked.findIndex((h) => rel.has(key(h)));
  return i < 0 ? 0 : 1 / (i + 1);
}

/** nDCG@k with binary relevance: rewards relevant results more the higher they rank, normalised to [0, 1]. */
export function ndcgAtK(ranked: Ref[], relevant: Ref[], k: number): number {
  const rel = new Set(relevant.map(key));
  const dcg = ranked.slice(0, k).reduce((s, h, i) => s + (rel.has(key(h)) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(k, relevant.length) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  return ideal === 0 ? 1 : dcg / ideal;
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
  const qs = questions.filter((q) => q.relevant.length > 0);
  const sum = { recall1: 0, recall3: 0, recall5: 0, precision3: 0, mrr: 0, ndcg5: 0 };
  const byTypeAcc: Record<string, { n: number; r5: number }> = {};
  const misses: string[] = [];
  for (const q of qs) {
    const ranked = toSectionRanking(await retrieve(q.query));
    sum.recall1 += recallAtK(ranked, q.relevant, 1);
    sum.recall3 += recallAtK(ranked, q.relevant, 3);
    const r5 = recallAtK(ranked, q.relevant, 5);
    sum.recall5 += r5;
    sum.precision3 += precisionAtK(ranked, q.relevant, 3);
    sum.mrr += reciprocalRank(ranked, q.relevant);
    sum.ndcg5 += ndcgAtK(ranked, q.relevant, 5);
    (byTypeAcc[q.type] ??= { n: 0, r5: 0 }).n++;
    byTypeAcc[q.type]!.r5 += r5;
    if (r5 < 1) misses.push(`${q.id} "${q.query}"`);
  }
  const n = qs.length;
  const avg = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / n])) as Omit<Metrics, 'queries'>;
  const byType = Object.fromEntries(Object.entries(byTypeAcc).map(([t, v]) => [t, v.r5 / v.n]));
  return { ...avg, queries: n, byType, misses };
}

/** A CI gate: fail loudly when quality drops below agreed thresholds. */
export function assertThresholds(m: Metrics, min: Partial<Record<keyof Metrics, number>>): string[] {
  return Object.entries(min)
    .filter(([k, v]) => (m[k as keyof Metrics] as number) < (v as number))
    .map(([k, v]) => `${k} ${(m[k as keyof Metrics] as number).toFixed(3)} < ${v}`);
}
