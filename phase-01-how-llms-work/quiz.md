# Phase 1 quiz: how LLMs work

Answer each question in your head (or on paper) **before** opening the answer. Target: 8/10. Below 7, revisit the linked theory note.

### 1. Your app sends a 2,000-character Urdu support message and a 2,000-character English one to the same model. Which costs more, and why?
<details><summary>Answer</summary>

The Urdu one, typically 2–6× more tokens. BPE vocabularies are learned mostly from English-heavy data, so Latin text has many long merged tokens while Arabic-script text is split into smaller pieces (and each Arabic-script character is 2 UTF-8 bytes at the byte level). Lab 01: the same sentence was 17 tokens in English and 106 (GPT-2) or 30 (o200k) in Urdu. → [01-tokens](theory/01-tokens.md)
</details>

### 2. A teammate estimates Claude costs by running `js-tiktoken` with `o200k_base`. What's wrong with that?
<details><summary>Answer</summary>

`o200k_base` is OpenAI's tokenizer. Claude uses its own, so counts differ, sometimes by tens of percent. Use the provider's `count_tokens` endpoint or the `usage` field on responses for billing, and keep local tokenizers for rough budgeting with a safety margin.
</details>

### 3. True or false: "Embedding similarity of 0.87 between two sentences means they mean nearly the same thing."
<details><summary>Answer</summary>

**False.** In Lab 02, "The deploy succeeded." vs "The deploy did not succeed." scored ~0.87, while a true paraphrase scored ~0.29. Embeddings capture topic and wording more than logic or negation, and raw scores aren't calibrated across models. → [02-embeddings](theory/02-embeddings.md)
</details>

### 4. You upgrade your embedding model from v1 to v2 (same 1024 dimensions). What must happen to the existing vector index?
<details><summary>Answer</summary>

Re-embed the whole corpus with v2. Vectors from different models live in different spaces even if the dimension count matches, so querying v1 vectors with v2 queries returns garbage. Similarity thresholds also need re-tuning. Treat it like changing the hash function of an index.
</details>

### 5. In one sentence, what does attention compute for a token?
<details><summary>Answer</summary>

A weighted average of earlier tokens' value vectors, where the weights are a softmax over how well this token's query matches each earlier token's key, i.e. a soft key-value lookup. → [03-attention](theory/03-attention-and-transformers.md)
</details>

### 6. Why is a response with 2,000 output tokens much slower than a request with 2,000 input tokens and a short answer?
<details><summary>Answer</summary>

Input (prefill) is processed in parallel in one pass. Output (decode) is generated **one token at a time**, each needing a forward pass bound by memory bandwidth. Latency ≈ TTFT + output_tokens / tokens-per-second, so output length dominates. That's also why output tokens are priced higher.
</details>

### 7. Your chatbot "forgot" the user's name after 30 turns. The model has a 1M-token window. What are the two most likely causes?
<details><summary>Answer</summary>

(1) Your backend truncates history (sliding window, summarization, or a smaller `max` you set) and dropped the turn with the name. The model is stateless and only knows what's in this request. (2) The name *is* in context but buried in the middle of a long prompt, where recall is weakest ("lost in the middle"). Fix: pin key facts (a memory/profile block near the top) instead of relying on raw history. → [04-context-windows](theory/04-context-windows.md)
</details>

### 8. A 40-turn conversation adds ~300 tokens per turn. Roughly how many input tokens are billed in total, without caching or truncation?
<details><summary>Answer</summary>

300 × (1 + 2 + … + 40) = 300 × 820 = **246,000** input tokens, for a conversation that's only 12,000 tokens long. Stateless re-sending makes the total quadratic in turn count.
</details>

### 9. Your extraction pipeline uses `temperature: 0`, yet a nightly run produced a slightly different JSON than yesterday. Is the system broken?
<details><summary>Answer</summary>

Not necessarily. T=0 makes sampling greedy, but logits themselves can shift between calls (batched floating-point math, quantization, MoE routing, silent provider updates). You reproduced a version of this in Phase 1: the q8 model's probability for the same prefix changed with the rest of the input. Design for it: schema-validate outputs, compare semantically in tests, pin model versions. → [05-sampling](theory/05-sampling.md)
</details>

### 10. The product team wants the model to "know" your internal API docs, which change weekly. Fine-tune or RAG?
<details><summary>Answer</summary>

**RAG** (retrieval). Fine-tuning is slow and costly to iterate, doesn't reliably inject facts, and would be stale within a week. Retrieval puts fresh, citable docs into the prompt at request time. Fine-tuning is for behaviour, style and format. → [06-training-vs-inference](theory/06-training-vs-inference.md)
</details>

---

## Senior interview questions
Practise answering out loud in 2–3 minutes each. Answer outlines are hidden.

**1. Walk me through what happens between sending a prompt to an LLM API and receiving the first streamed token.**
<details><summary>What a strong answer covers</summary>

Chat messages rendered into one templated string with special tokens. Tokenization. Request queued and batched with others. Prefill: embedding lookup, then N transformer blocks process all prompt tokens in parallel and fill the KV cache (cost grows with prompt length, which drives TTFT). Final position → logits → sampling (temperature/top-p) → first token streamed via SSE. Then decode, one token per forward pass, reusing the KV cache. Bonus: prompt caching skips prefill for a reused prefix. Reasoning models emit hidden thinking tokens before the first visible token.
</details>

**2. Why do LLMs hallucinate, and what can an engineering team actually do about it?**
<details><summary>What a strong answer covers</summary>

The training objective is plausible continuation, not truth. With no fact in the weights, the most plausible continuation is still fluent and confident. Sampling at higher T adds variance, and T=0 doesn't fix it. Mitigations are architectural: retrieval grounding with citations, tools for facts and computation, constrained/structured outputs, "say I don't know" instructions plus refusal evals, verification steps, and offline/online evals measuring groundedness. Hallucination rate is a metric to track, not a bug to fix once.
</details>

**3. How would you estimate and control the monthly LLM cost of a new chat feature before launch?**
<details><summary>What a strong answer covers</summary>

Model the traffic: requests/day × (input tokens incl. system + tools + RAG + history, output tokens). Account for quadratic history growth and reasoning tokens. Use real tokenizer counts per provider. Levers: model tiering/routing (a 20×+ price spread), prompt caching for stable prefixes, history truncation/summarization, retrieval top-k limits, `max_tokens` caps, batch API for offline work, and per-user/tenant budgets with alerts. Measure with `usage` fields in production and compare with the estimate.
</details>

**4. Explain embeddings to a backend engineer, and name two ways they fail in production search.**
<details><summary>What a strong answer covers</summary>

Fixed-length vectors where nearby means semantically related, a locality-sensitive "index key for meaning". Searched by cosine/dot-product kNN. Failures: (a) similarity ≠ relevance (negation, numbers, exact IDs/SKUs, acronyms), hence hybrid keyword + vector search and reranking; (b) model or version drift: mixing vectors from different models, or chunking changes without re-embedding. Also uncalibrated thresholds, missing query/document prefixes for asymmetric models, and long documents averaged into one vector.
</details>

**5. Context windows are now 1M tokens. Do we still need RAG and memory management?**
<details><summary>What a strong answer covers</summary>

Yes. Cost: every token is billed on every request, and history makes it quadratic. Latency: prefill time grows with input, raising TTFT. Quality: accuracy degrades with long, noisy context ("lost in the middle", context rot). Freshness and access control: retrieval enforces per-user permissions and up-to-date data. Large windows change the trade-off (fewer, bigger chunks; whole-document reasoning becomes viable) but don't remove the need to *choose* what goes in. Caching makes big stable prefixes cheaper, not free.
</details>
