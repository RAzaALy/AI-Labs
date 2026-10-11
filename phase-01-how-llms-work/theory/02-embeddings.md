# 2. Embeddings

**Time:** 20 min · **Visualization:** [`embedding-space.html`](../visualizations/embedding-space.html) · **Lab:** [`labs/02-embeddings`](../labs/02-embeddings)

## The idea
An **embedding** is a fixed-length vector of floats (e.g. 384, 1024 or 3072 dimensions) that represents meaning. Texts with similar meaning land near each other, and you compare them with **cosine similarity**: the angle between two vectors, from −1 to 1. If vectors are L2-normalized, cosine similarity equals the plain dot product.

The word "embedding" covers two related but different things:
1. **Token embeddings** live *inside* an LLM. Its first layer is a lookup table `vocab_size × d_model` that turns each token ID into a vector, which the transformer then refines layer by layer.
2. **Sentence/document embeddings** come from a separate **embedding model** (MiniLM, `text-embedding-*`, `gemini-embedding-2`, …) that maps a whole passage to one vector. This is what you use for search, RAG, clustering and deduplication.

## Web-engineering analogy
A sentence embedding is a **search index key for meaning**. Think of it as a hash function where *similar inputs produce nearby outputs* (the opposite of a cryptographic hash). A vector database is an index over those keys that answers "give me the k nearest keys" instead of "give me the exact key".

Changing the embedding model is like **changing the hash function of your index**: every stored key becomes invalid and you must re-index (re-embed) the whole corpus.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| More dimensions (1024–3072) | Captures finer distinctions | More storage and RAM, slower search; often marginal gains |
| Fewer dimensions (384) | Cheap and fast, runs locally on CPU | Weaker on nuanced or domain-specific text |
| Hosted embedding API | Strong quality, no infra | Per-token cost, latency, data leaves your network |
| Local (transformers.js / Ollama) | Free, private, works offline | You own model updates; quality varies by model |
| Matryoshka / truncatable embeddings | Trade dimension for cost at query time | Only if the model was trained for it |

## Facts you must know
- **Vectors from different models are not comparable**, even when the dimension count matches.
- **Cosine similarity scores are not calibrated probabilities.** 0.62 might be a great match for one model and noise for another. Pick thresholds per model, from data.
- **Some models are asymmetric.** They expect different prefixes for queries vs documents (e.g. E5: `query:` / `passage:`). Skipping the prefix silently hurts retrieval.
- **2D plots lie.** Projecting 384 dimensions to 2 (PCA/t-SNE/UMAP) distorts distances. In the visualization, compare "2D distance" with "true cosine" to see this.

## ⚠️ Common mistakes
1. **Treating similarity as relevance or truth.** "The deploy succeeded" and "The deploy did not succeed" are *very* similar vectors. Embeddings capture topic and phrasing more than logic, negation or numbers. This is why Phase 3 adds keyword search, reranking and evals.
2. **Mixing embedding models in one index** after an upgrade without re-embedding.
3. **Embedding huge documents as a single vector.** Meaning gets averaged into mush. You chunk first (Phase 3).
4. **Not normalizing** and then using dot product as if it were cosine.

## Senior check
You can explain the difference between token embeddings and sentence embeddings, why "similar" ≠ "relevant", and what a model change costs operationally (full re-index plus re-tuned thresholds).
