// Reranking: retrieve many cheaply (bi-encoder / keyword), then score the few precisely (cross-encoder).
import { AutoModelForSequenceClassification, AutoTokenizer, type PreTrainedModel, type PreTrainedTokenizer } from '@huggingface/transformers';
import { rerank } from 'ai';
import type { RerankingModelV4 } from '@ai-sdk/provider';
import type { Sql } from '../../../../shared/db.ts';
import type { Embedder } from '../../../../shared/embeddings.ts';
import '../../../../shared/local-models.ts'; // model cache location
import { hybridSearch, type Fused } from '../../03-hybrid-search/solution/index.ts';

export const CROSS_ENCODER = 'mixedbread-ai/mxbai-rerank-xsmall-v1';

/**
 * A cross-encoder reads (query, document) TOGETHER and outputs one relevance score, so it can see
 * word-level interactions that two independent embeddings cannot. Too slow to run over a whole corpus,
 * so it runs on the top candidates only.
 *
 * Wrapped as an AI SDK RerankingModelV4, so the standard `rerank()` function works with it,
 * exactly like cohere.reranking('rerank-v4.0-pro') would.
 */
export function localCrossEncoder(): RerankingModelV4 {
  let loaded: Promise<{ tok: PreTrainedTokenizer; model: PreTrainedModel }> | undefined;
  const load = () =>
    (loaded ??= (async () => ({
      tok: await AutoTokenizer.from_pretrained(CROSS_ENCODER),
      model: await AutoModelForSequenceClassification.from_pretrained(CROSS_ENCODER, { dtype: 'fp32' }),
    }))());
  return {
    specificationVersion: 'v4',
    provider: 'local',
    modelId: CROSS_ENCODER,
    async doRerank({ documents, query, topN }) {
      const { tok, model } = await load();
      const texts = documents.type === 'text' ? documents.values : documents.values.map((d) => JSON.stringify(d));
      const inputs = tok(new Array(texts.length).fill(query), { text_pair: texts, padding: true, truncation: true, max_length: 512 });
      const { logits } = await model(inputs);
      const scores = Array.from(logits.data as Float32Array);
      const ranking = scores
        .map((relevanceScore, index) => ({ index, relevanceScore }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, topN ?? scores.length);
      return { ranking };
    },
  };
}

export interface Reranked extends Fused {
  rerankScore: number;
  firstStageRank: number;
}

/** Two-stage retrieval: hybrid top-`candidates` → cross-encoder → top-k. */
export async function retrieveAndRerank(
  sql: Sql,
  embedder: Embedder,
  query: string,
  opts: { k?: number; candidates?: number; table?: string; model?: RerankingModelV4; onlyCurrent?: boolean } = {},
): Promise<Reranked[]> {
  const candidates = await hybridSearch(sql, embedder, query, opts.candidates ?? 20, { table: opts.table, onlyCurrent: opts.onlyCurrent, candidates: opts.candidates ?? 20 });
  if (candidates.length === 0) return [];
  const { ranking } = await rerank({
    model: opts.model ?? localCrossEncoder(),
    query,
    documents: candidates.map((c) => `${c.section}\n${c.content}`), // include the heading: it carries meaning
    topN: opts.k ?? 5,
  });
  return ranking.map((r) => ({ ...candidates[r.originalIndex]!, rerankScore: r.score, firstStageRank: r.originalIndex + 1 }));
}
