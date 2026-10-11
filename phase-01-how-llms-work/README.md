# Phase 1: How LLMs work

**Level:** Base · **Time budget:** ~10 h (2 days at 5–6 h/day, or week 1 of the 12-week plan) · **API keys:** none, everything runs locally on CPU

You won't train models in this course, but every production decision you make later (cost, latency, context strategy, RAG design, eval design) rests on the mechanics covered here. This phase is tuned for a backend/full-stack engineer: intuition plus the numbers that matter, and no linear algebra beyond one optional lab.

## Learning objectives
By the end you can:
1. Explain tokenization (BPE) and predict when text gets expensive (non-English, JSON, IDs, code).
2. Distinguish token embeddings from sentence embeddings, use cosine similarity, and explain why similar ≠ relevant.
3. Describe the transformer pipeline end to end (tokens → embeddings → N × [attention + MLP] → logits → sampling) and what attention does, at intuition level.
4. Treat the context window as a payload budget for a **stateless** API, and design a truncation policy.
5. Implement temperature / top-k / top-p sampling and explain why T=0 is neither deterministic nor "correct".
6. Separate training from inference, explain why models hallucinate, and order prompting → RAG → fine-tuning.

## Prerequisites
- Node ≥ 22 and `npm install` at the repo root (see the [root README](../README.md)).
- ~1 GB of disk for local models (downloaded once into `.cache/models`).

## 📺 Watch / read this first (in order)
From [resources.md](../resources.md). About 2 h total.
1. **3Blue1Brown: [Large Language Models explained briefly](https://www.youtube.com/watch?v=LPZh9BOjkQs)** · 8 min. The whole picture, gently.
2. **3Blue1Brown: [Transformers, the tech behind LLMs (Ch. 5)](https://www.youtube.com/watch?v=wjZofJX0v4M)** · 27 min. Embeddings, the pipeline, logits.
3. **3Blue1Brown: [Attention in transformers, step-by-step (Ch. 6)](https://www.youtube.com/watch?v=eMlx5fFNoYc)** · 26 min. Queries, keys, values, visually.
4. **Andrej Karpathy: [Intro to Large Language Models](https://www.youtube.com/watch?v=zjkBMFhNj_g)** · 60 min. Training vs inference, the LLM "OS" view, security preview.
5. *(Optional)* **Andrej Karpathy: [Deep Dive into LLMs like ChatGPT](https://www.youtube.com/watch?v=7xTGNNLPyMI)** · 3.5 h. Pre-training → SFT → RL in depth. Watch on a weekend.

## Work plan
| # | Item | Type | Time |
|---|---|---|---|
| 1 | [Tokens](theory/01-tokens.md) + [tokenizer playground](visualizations/tokenizer-playground.html) | theory + viz | 35 min |
| 2 | [Lab 01: tokens and cost](labs/01-tokens) | lab | 45 min |
| 3 | [Embeddings](theory/02-embeddings.md) + [embedding space explorer](visualizations/embedding-space.html) | theory + viz | 35 min |
| 4 | [Lab 02: embeddings and semantic search](labs/02-embeddings) | lab | 45 min |
| 5 | [Attention and transformers](theory/03-attention-and-transformers.md) + [attention heatmap](visualizations/attention-heatmap.html) + [transformer pipeline](visualizations/transformer-pipeline.html) | theory + viz | 50 min |
| 6 | [Context windows](theory/04-context-windows.md) + [context window budget](visualizations/context-window.html) | theory + viz | 25 min |
| 7 | [Lab 04: context budgets](labs/04-context-budget) | lab | 40 min |
| 8 | [Sampling](theory/05-sampling.md) + [sampling lab](visualizations/sampling-lab.html) | theory + viz | 25 min |
| 9 | [Lab 03: sampling and the generation loop](labs/03-sampling) | lab | 60 min |
| 10 | [Training vs inference](theory/06-training-vs-inference.md) (pipeline viz, tab 2) | theory + viz | 20 min |
| 11 | [Project: LLM X-ray CLI](project/) | project | 2–2.5 h |
| 12 | [Quiz + interview questions](quiz.md) | review | 30 min |
| — | *(Optional)* [Lab 05: attention in 30 lines](labs/05-attention-math) | lab | 30 min |

The videos plus items 1–12 come to about 10 h. A suggested split at 5–6 h/day: **Day 1** covers videos 1–4 and items 1–5. **Day 2** covers items 6–12.

Open visualizations by double-clicking the HTML file, or from the terminal:
```bash
xdg-open phase-01-how-llms-work/visualizations/tokenizer-playground.html
```

## ⚠️ The concepts most people get wrong (flagged throughout)
1. **"The model remembers."** It's stateless. Memory is your code re-sending history. → [04](theory/04-context-windows.md)
2. **"Temperature 0 = deterministic and correct."** Neither. → [05](theory/05-sampling.md)
3. **"High similarity = relevant/true."** Negation scores 0.87. → [02](theory/02-embeddings.md)
4. **"Characters ≈ tokens / one tokenizer fits all providers."** Cost and limits are in *provider-specific* tokens. → [01](theory/01-tokens.md)

## ✅ What a senior should be able to explain after this phase
- [ ] Why the same text has a different token count on Claude, GPT and Gemini, and how you'd measure real usage
- [ ] Why Urdu, JSON with UUIDs, and base64 cost more tokens than English prose
- [ ] Token embeddings vs sentence embeddings; cosine similarity; why changing the embedding model means re-indexing
- [ ] Why "similar" ≠ "relevant", with a concrete failure example
- [ ] The inference pipeline from string to streamed token, including where the KV cache sits
- [ ] What attention computes, as a soft key-value lookup, and why its cost grows with context length
- [ ] Prefill vs decode, and why output length dominates latency and price
- [ ] Why chat cost grows quadratically with turns, and three ways to bound it
- [ ] How temperature, top-k and top-p transform logits, and why T=0 still isn't reproducible in production
- [ ] Pre-training vs SFT vs RL vs inference; why hallucination follows from the objective; prompting vs RAG vs fine-tuning

## Verify everything in this phase
```bash
npm run verify:p1
```
This runs every lab solution and the project's acceptance tests against the reference implementation.
