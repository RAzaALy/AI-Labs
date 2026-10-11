# 3. Attention and the transformer (intuition level)

**Time:** 30 min · **Visualizations:** [`attention-heatmap.html`](../visualizations/attention-heatmap.html), [`transformer-pipeline.html`](../visualizations/transformer-pipeline.html) · **Lab (optional):** [`labs/05-attention-math`](../labs/05-attention-math)

## The idea
A transformer is a stack of identical **blocks**. Each block does two things to every token's vector:
1. **Attention** lets each token *look at other tokens* and pull in information from the relevant ones ("it" pulls from "cat").
2. **MLP (feed-forward)** processes each token's vector independently. This is where much of the factual "knowledge" is stored.

Residual connections add each block's output back onto its input, so information flows up a **residual stream**. After the last block, a final layer turns the last token's vector into **logits**: one score per vocabulary entry, i.e. a prediction of the next token. That's the whole trick: **an LLM is a next-token predictor**, run in a loop.

### Attention in one paragraph
Every token produces three vectors: a **query** ("what am I looking for?"), a **key** ("what do I contain?") and a **value** ("what I'll hand over if picked"). For token *i*, score every earlier token *j* with `q_i · k_j / √d`, softmax the scores into weights that sum to 1, and output the weighted sum of the values. A **causal mask** blocks attention to future tokens, which is why generation is left-to-right. **Multi-head** attention runs many of these in parallel with different learned projections, so one head can track "previous token" while another tracks "who does this pronoun refer to".

## Web-engineering analogy
Attention is a **soft, differentiable key-value lookup**. A `Map.get(key)` returns exactly one value for an exact key. Attention compares the query to *every* key, gets a similarity score for each, and returns a **weighted blend of all values**. It's like a SQL join where every row matches with a confidence weight, and the result is the weighted average.

The full model is a **middleware pipeline**: the request (token vectors) flows through 30–100 identical middleware layers, each enriching it, and the final handler emits a response (next-token scores).

## Why this matters to you as an engineer
- **Cost scales with sequence length.** Naive attention compute is O(n²) in context length. Doubling the prompt more than doubles prefill work, which is why long prompts are slower (higher **TTFT**, time to first token) and why providers sometimes price long context higher.
- **KV cache.** During generation, keys and values of past tokens are cached, so each new token costs ~O(n) instead of recomputing everything. This is what **prompt caching** sells you across requests (Phase 2): a reused prefix skips prefill.
- **Prefill vs decode.** Reading your prompt (prefill) is parallel and fast. Writing output (decode) is one token at a time, bound by memory bandwidth. **Output length dominates latency**, so asking for shorter output is the cheapest speed-up.
- **Position matters.** Models encode token positions, and in long contexts they attend best to the beginning and end ("lost in the middle"). Put instructions and the most important evidence at the edges.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Bigger model (more layers/params) | Better reasoning and knowledge | Slower, pricier, needs more GPU memory |
| Mixture-of-Experts (MoE) | Many total params, few active per token, so cheaper inference | Large memory footprint; can be less deterministic |
| Longer context window | Fit whole docs/codebases | Quadratic-ish cost; quality degrades as context fills ("context rot") |

## ⚠️ Common mistakes
1. **Thinking the model "reads" like a person or "looks up" facts.** It computes weighted blends of vectors. Facts are patterns in weights, so hallucinations are fluent pattern completions, not lookup failures.
2. **Believing attention maps are explanations.** Attention weights are one internal signal among many. Don't build product logic on them.
3. **Assuming a long window means it will use everything equally.** Relevance and position still matter. Retrieval (Phase 3) often beats stuffing.

## Senior check
You can draw the pipeline from text to tokens, embeddings, N blocks (attention + MLP), logits and a sampled token appended back into the input. You can explain the KV cache and why output tokens dominate latency.
