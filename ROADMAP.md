# Roadmap

Total: **~132 hours**. Two schedules are given: the **intensive** plan is the default (5–6 h/day), and the **12-week** plan is the part-time alternative. Hours are honest estimates for an experienced engineer. Debugging local setups (Docker, Ollama, deployment) is where overruns usually happen, so buffer days are built in.

| Phase | Hours | Intensive (days) | 12-week plan |
|---|---|---|---|
| 1. How LLMs work | 10 | 2 | Week 1 |
| 2. Working with LLM APIs | 20 | 4 | Weeks 2–3 |
| 3. RAG | 22 | 4 | Weeks 4–5 |
| 4. Agents | 20 | 4 | Weeks 6–7 |
| 5. MCP | 11 | 2 | Week 8 |
| 6. Local models | 11 | 2 | Week 9 |
| 7. Production | 16 | 3 | Week 10 + half of 11 |
| 8. Capstone | 22 | 4 | Half of week 11 + week 12 |
| Buffer | — | 2 | — |
| **Total** | **132** | **27 days ≈ 4.5 weeks at 6 days/week** | **12 weeks at 10–12 h/week** |

## Intensive plan (default): 5–6 h/day, 6 days/week
| Day | Focus | Hours | Checkpoint (must be true before moving on) |
|---|---|---|---|
| 1 | P1: videos, tokens, embeddings, labs 01–02 | 5.5 | Labs 01–02 green; you can explain why negation scores 0.87 |
| 2 | P1: attention, context, sampling, labs 03–04, X-ray project, quiz | 5 | `npm run verify:p1` green, your X-ray passes all 6 ACs, quiz ≥ 8/10 |
| 3 | P2: raw API calls (Anthropic + OpenAI-compatible), messages, system prompts | 5 | You can make a streaming call with curl and read the SSE events |
| 4 | P2: AI SDK, structured output, tool calling loop | 5 | Tool-calling lab green with mock **and** one live provider |
| 5 | P2: multimodal, caching, cost; start project | 5 | Cost meter matches the provider's `usage` within 1% |
| 6 | P2: finish streaming chat UI project + quiz | 5 | Project ACs pass. **Rest day after** |
| 7 | P3: chunking, embeddings at scale, Postgres + pgvector (Docker install) | 5.5 | pgvector running locally; corpus ingested |
| 8 | P3: hybrid search (BM25 + vector, RRF), reranking | 5.5 | Hybrid beats vector-only on your eval set |
| 9 | P3: retrieval evals (recall@k, MRR), project build | 5.5 | Eval suite runs in one command |
| 10 | P3: finish "chat with your docs" with citations + quiz | 5.5 | Every answer cites sources; refuses when retrieval is empty |
| 11 | P4: hand-written agent loop, tool design | 5 | Your loop handles tool errors and max-steps |
| 12 | P4: ToolLoopAgent, memory, planning, human-in-the-loop | 5 | Approval flow blocks a destructive tool |
| 13 | P4: multi-agent patterns, failure modes; project build | 5 | Agent completes 4/5 scripted tasks |
| 14 | P4: finish multi-tool agent + quiz. **Buffer** | 5 | Project ACs pass. **Rest day after** |
| 15 | P5: MCP concepts, spec 2026-07-28, build a server | 5.5 | Inspector lists your tools/resources/prompts |
| 16 | P5: client, auth, connect to Claude Code/Desktop; project + quiz | 5.5 | A real host uses your server end to end |
| 17 | P6: Ollama install, quantization, local vs hosted benchmarks | 5.5 | You have measured tokens/s and quality on your own laptop |
| 18 | P6: agent on a local model with hosted fallback; optional LoRA (Colab) | 5.5 | Fallback triggers on timeout/low confidence |
| 19 | P7: evals + regression testing (promptfoo), LLM-as-judge | 5.5 | Eval suite fails CI on a seeded regression |
| 20 | P7: tracing (OTel + Langfuse), guardrails, prompt injection | 5.5 | You can find a slow/expensive step from a trace |
| 21 | P7: rate limits, cost/latency, queues; harness project + quiz | 5 | Harness ACs pass in GitHub Actions. **Rest day after** |
| 22 | P8: capstone architecture, auth, data model, ingestion jobs | 5.5 | ADRs written; schema migrated |
| 23 | P8: RAG + agent + MCP integration, streaming UI | 5.5 | Happy path works locally in Docker Compose |
| 24 | P8: evals in CI, tracing, guardrails, cost controls | 5.5 | CI green with eval gate |
| 25 | P8: deploy to Railway, runbook, load/cost check | 5.5 | Public URL; runbook rehearsed (deploy, rollback, key rotation) |
| 26–27 | **Buffer**: catch up, stretch goals, or polish the capstone for your portfolio | — | — |

## 12-week plan: 10–12 h/week
| Week | Phase | Hours | Checkpoint |
|---|---|---|---|
| 1 | P1 How LLMs work | 10 | `verify:p1` green, X-ray ACs pass, quiz ≥ 8/10 |
| 2 | P2 APIs: raw calls, AI SDK, structured output | 10 | Tool-calling lab green with mock + one live provider |
| 3 | P2 APIs: multimodal, caching, cost, chat UI project | 10 | Chat UI ACs pass |
| 4 | P3 RAG: chunking, pgvector, hybrid search | 11 | Hybrid beats vector-only on your eval set |
| 5 | P3 RAG: reranking, evals, docs-chat project | 11 | Citations + retrieval eval suite |
| 6 | P4 Agents: loop, tools, memory, HITL | 10 | Approval flow works |
| 7 | P4 Agents: multi-agent, failure modes, project | 10 | Agent ACs pass |
| 8 | P5 MCP | 11 | Real host uses your server |
| 9 | P6 Local models | 11 | Local + fallback agent works |
| 10 | P7 Production: evals, tracing, guardrails | 11 | Eval gate in CI |
| 11 | P7 finish (5 h) + P8 capstone start (6 h) | 11 | Capstone runs locally |
| 12 | P8 Capstone: deploy + runbook | 11–12 | Deployed with a runbook |

## Stay current: a 30-minute weekly habit
This field changes monthly. Every week, timebox 30 minutes:
1. **5 min:** [Simon Willison's weblog](https://simonwillison.net/). The best single filter for what's new and what actually works.
2. **5 min:** changelogs for your stack: [AI SDK releases](https://github.com/vercel/ai/releases), [MCP blog](https://blog.modelcontextprotocol.io/), and your providers' model/deprecation pages ([Claude](https://platform.claude.com/docs/en/about-claude/model-deprecations), [OpenAI](https://developers.openai.com/api/docs/changelog), [Gemini](https://ai.google.dev/gemini-api/docs/changelog)).
3. **10 min:** one deep engineering post from [Anthropic Engineering](https://www.anthropic.com/engineering), [Hamel Husain](https://hamel.dev/), [Eugene Yan](https://eugeneyan.com/) or [Latent Space](https://www.latent.space/).
4. **5 min:** [Artificial Analysis](https://artificialanalysis.ai/) for price/latency/quality shifts, and the [Ollama library](https://ollama.com/library) for new small open models.
5. **5 min:** write down one thing to try, and add it to a `TRY.md` in your project.

Skip the hype: if a claim has no eval, benchmark or code, it can wait.
