# AI Engineering Path: from zero to production AI features (TypeScript-first)

A ~130-hour curriculum for an experienced full-stack engineer who is new to AI. It goes from how LLMs work, through APIs, RAG, agents, MCP and local models, to production, and ends with a deployed full-stack app that has a real AI layer.

- **TypeScript everywhere.** Python appears once (optional LoRA fine-tuning, Phase 6), kept minimal.
- **Concepts mapped to web engineering.** Context window ≈ request payload budget, embeddings ≈ index keys for meaning, agents ≈ an event loop with a planner, MCP ≈ LSP for AI tools.
- **Every lab runs.** Each lab has a `starter/`, a `solution/` and a `check.ts` that tells you when you're done. `npm run verify` runs all solutions.
- **Interactive visualizations.** Single-file HTML, no build step, opened straight from disk.
- **Free-tier first.** Phase 1 needs no API key. Later phases default to free tiers (Gemini, Groq, OpenRouter) and fall back to Claude/OpenAI or a local model.

## The path
| Level | Phase | Hours | You build |
|---|---|---|---|
| Base | [1. How LLMs work](phase-01-how-llms-work/) | 10 | LLM X-ray CLI: tokens, cost, semantic search, a local model with your own sampler |
| Base | [2. Working with LLM APIs](phase-02-llm-apis/) | 20 | Streaming chat UI with structured output, tool calling, and a token/cost meter |
| Intermediate | 3. RAG | 22 | "Chat with your docs" with citations, plus a retrieval eval suite |
| Intermediate | 4. Agents | 20 | Multi-tool agent that completes real tasks, with human-in-the-loop approvals |
| Intermediate | 5. MCP | 11 | MCP server over your docs database, used from Claude Code/Desktop and your own agent |
| Advanced | 6. Local models | 11 | The agent on a local model with hosted fallback (+ optional LoRA) |
| Advanced | 7. Production | 16 | Eval + tracing harness wired into CI, with guardrails and cost controls |
| Advanced | 8. Capstone | 22 | Production Next.js + Node + Postgres/pgvector app with RAG, agents, MCP, jobs, evals, tracing, deployed with a runbook |

Phases are added one at a time; each phase folder appears when it's built and verified (Phases 1–2 are published). The full schedule is in [ROADMAP.md](ROADMAP.md). Tick items off in [PROGRESS.md](PROGRESS.md).

## Stack (versions verified 2026-10-10)
| Layer | Choice | Why |
|---|---|---|
| LLM SDK | Vercel AI SDK `ai@7` | TS-native, provider-agnostic: streaming, structured output, tools, `ToolLoopAgent`, MCP client |
| Raw SDKs (Phase 2 only) | `@anthropic-ai/sdk`, `openai` | See the wire format before using the abstraction |
| Models | Free tiers (Gemini, Groq, OpenRouter) → Claude Sonnet/Haiku 5.5 → OpenAI GPT-6 family | You choose via `.env`, and `shared/llm.ts` picks one |
| Local inference | transformers.js (Phase 1), Ollama 0.40 (Phase 6) | Keyless and private. CPU-friendly small models |
| Vector store | Postgres 18 + pgvector 0.8 + Drizzle | One database for app data and vectors. Hybrid search in SQL |
| MCP | `@modelcontextprotocol/server` / `client` v2 (spec 2026-07-28) | Current stable line |
| Evals / tracing | promptfoo + Vitest, OpenTelemetry + Langfuse | CI-native evals; vendor-neutral, self-hostable tracing |
| App | Next.js 16, better-auth, pg-boss, Docker, Railway | Postgres-only queue, simple deploys |

## Setup
```bash
node -v            # needs >= 22
npm install
cp .env.example .env   # Phase 1 needs nothing; from Phase 2 add a free Gemini key for live runs
npm run verify         # every lab solution + project acceptance test, on a mock model (offline)
npm run verify:live    # the same against the provider in .env
```
- Local models download once into `.cache/models` (~700 MB for Phase 1, fp32 for exact results).
- Project apps (Phase 2+) are npm **workspaces**, so the single `npm install` at the root covers them.
- Hardware assumed: a laptop CPU with 16 GB RAM. No GPU needed. Phase 6 sizes local models for this.

## How to use this repo
1. Open the phase `README.md`: objectives, watch-first list, work plan with times, and the "senior should be able to explain" checklist.
2. For each concept: read the theory note (each has the idea, a web analogy, trade-offs and common mistakes), then open its visualization.
3. Do the lab in `starter/`, and run `npx tsx <lab>/check.ts starter` until it's green. Compare with `solution/` afterwards.
4. Build the phase project from `project/starter/` against its acceptance tests. The `reference/` is for after you're done.
5. Take `quiz.md` closed-book. Practise the interview questions out loud.
6. Anything marked **(optional)** can be skipped without leaving a gap.

### Repo layout
```
README.md  ROADMAP.md  PROGRESS.md  glossary.md  resources.md  .env.example
shared/                 # small helpers used across phases (model cache, pricing, rng, lab harness)
scripts/verify.ts       # runs every lab solution + project reference check
phase-01-how-llms-work/
  README.md  quiz.md
  theory/               # one note per concept
  visualizations/       # self-contained interactive HTML (+ _data/generate.ts that bakes real model outputs in)
  labs/NN-name/         # README, starter/, solution/, check.ts
  project/              # README (spec, ACs, diagram, rubric), starter/, reference/, check.ts, fixtures/
phase-02-llm-apis/      # same shape; project/starter and project/reference are Next.js 16 apps
```

## The concepts most people get wrong
Flagged with ⚠️ wherever they come up:
1. **The model is stateless.** Memory, sessions and "learning from users" are things your code does.
2. **The model never executes tools.** It emits a request, and your code runs it with your permissions. Authorization lives in your code.
3. **Most bad RAG answers are retrieval failures.** Measure retrieval separately from generation. Similarity ≠ relevance.
4. **Prompt injection can't be fixed with better prompting.** It's a capability and authorization design problem.

Plus one from Phase 1: temperature 0 is neither deterministic nor "correct".
