# Lab 05 (OPTIONAL): Attention in 30 lines (≈30 min)

**Concept:** [theory/03-attention-and-transformers.md](../../theory/03-attention-and-transformers.md) · **No API key needed.** Skip it if you're short on time. The visualization covers the same intuition.

## Task
Implement `matmul`, `transpose`, a mask-aware `softmaxRow`, and `attention(Q, K, V, causal)` in `starter/index.ts`:

```
Attention(Q, K, V) = softmax(Q·Kᵀ / √d + causal_mask) · V
```

The check uses a hand-built toy where the pronoun "it" has a query looking for "animal", and only "cat" has a matching key. You'll see "it" pull the animal feature from "cat" into its own output vector. That's coreference resolution, as one head in a real model might learn it.

## Run
```bash
npx tsx phase-01-how-llms-work/labs/05-attention-math/check.ts starter
```

## What to notice
- Attention is a **soft lookup**: compare one query against every key, softmax the scores, and blend the values.
- The causal mask is why generation is left-to-right, and why a KV cache works (past keys and values never change).
- In a real model Q, K and V come from **learned** projections of each token's vector, with dozens of heads per layer and dozens of layers.
