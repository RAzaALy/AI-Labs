# Progress

Tick items as you finish them (`[x]`). A phase is done when its checkpoint in [ROADMAP.md](ROADMAP.md) is true.

## Phase 1: How LLMs work (~10 h)
- [ ] Watch: LLMs explained briefly · Transformers (Ch. 5) · Attention (Ch. 6) · Intro to LLMs
- [ ] Theory: 01 tokens · 02 embeddings · 03 attention/transformers · 04 context windows · 05 sampling · 06 training vs inference
- [ ] Visualizations: tokenizer playground · embedding space · attention heatmap · transformer pipeline · context window · sampling lab
- [ ] Lab 01 tokens: `check.ts starter` green
- [ ] Lab 02 embeddings: green
- [ ] Lab 03 sampling: green
- [ ] Lab 04 context budget: green
- [ ] *(optional)* Lab 05 attention math: green
- [ ] Project LLM X-ray: AC1–AC6 pass on `starter`
- [ ] Project self-review rubric: score ≥ 2 in every row
- [ ] Quiz ≥ 8/10 · interview questions practised out loud
- [ ] Senior checklist in the phase README: every box ticked

## Phase 2: Working with LLM APIs (~20 h)
- [ ] Read first: AI SDK foundations · Anthropic prompt engineering · AI SDK tools · Gemini structured output + function calling · AWS backoff & jitter
- [ ] Theory: 01 anatomy · 02 prompting · 03 streaming · 04 structured output · 05 tool calling · 06 multimodal · 07 cost/caching/limits
- [ ] Visualizations: request anatomy · SSE streaming · tool loop · constrained decoding · cost calculator · rate limits & retries
- [ ] Lab 01 raw HTTP + retries: green (mock) · green (live)
- [ ] Lab 02 SSE by hand: green · live TTFT measured
- [ ] Lab 03 AI SDK + prompt eval: green · live accuracy ≥ 7/8
- [ ] Lab 04 structured output: green
- [ ] Lab 05 tool calling (manual + SDK): green
- [ ] Lab 06 multimodal: green · image token cost measured
- [ ] Lab 07 cost meter + hidden tokens: green
- [ ] Project Support Copilot: AC1–AC9 pass on `starter` (mock) **and** `LIVE=1`
- [ ] Clicked through the UI: stop button, tool cards, ticket, meter; console clean
- [ ] Project self-review rubric ≥ 2 in every row
- [ ] Quiz ≥ 8/10 · interview questions practised
- [ ] Senior checklist in the phase README: every box ticked

## Phase 3: RAG (~22 h)
- [ ] Setup: Docker works without sudo · `npm run db:up` · `npm run verify:p3` green
- [ ] Read first: Anthropic contextual retrieval · Pinecone chunking strategies · pgvector README · Supabase hybrid search · Jason Liu levels of RAG
- [ ] Theory: 01 overview · 02 chunking · 03 embeddings & pgvector · 04 hybrid · 05 reranking · 06 generation & citations · 07 retrieval evals
- [ ] Visualizations: RAG pipeline · chunking playground · HNSW search · hybrid RRF · rerank funnel · retrieval metrics
- [ ] Lab 01 chunking: green · fixed vs structure-aware compared
- [ ] Lab 02 pgvector: green · ANN recall vs `ef_search` measured
- [ ] Lab 03 hybrid search + RRF: green · E-4290 case understood
- [ ] Lab 04 reranking: green · decided from MRR + latency whether to keep it
- [ ] Lab 05 retrieval evals: green · your keyword / vector / hybrid table recorded
- [ ] Lab 06 grounded answers: green (mock) · live golden-set accuracy recorded
- [ ] Project Docs Chat: AC1–AC8 pass on `starter` (mock) **and** `LIVE=1`
- [ ] `npm run eval -- --answers` run live; failures read and explained
- [ ] Clicked through the UI: citation chips, sources panel, "not in the docs" badge; console clean
- [ ] Project self-review rubric ≥ 2 in every row
- [ ] Quiz ≥ 8/10 · interview questions practised
- [ ] Senior checklist in the phase README: every box ticked

## Phase 4: Agents (~20 h)
_Unlocks when the phase is published._

## Phase 5: MCP (~11 h)
_Unlocks when the phase is published._

## Phase 6: Local models (~11 h)
_Unlocks when the phase is published._

## Phase 7: Production (~16 h)
_Unlocks when the phase is published._

## Phase 8: Capstone (~22 h)
_Unlocks when the phase is published._
