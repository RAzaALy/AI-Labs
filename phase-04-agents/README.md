# Phase 4: Agents

**Level:** Intermediate · **Time budget:** ~20 h (4 days at 5–6 h/day, or weeks 6–7 of the 12-week plan) · **Keys:** optional. Every lab and the project run offline on scripted models; with a free **Gemini** key they also run live (paced to 14 requests/min, so live agent runs take minutes, not seconds). · **Needs:** Docker Postgres for the project (`npm run db:up`).

Phases 2–3 gave you tool calls and grounded answers. This phase lets the model **decide what to do next**: a loop of tool calls with stop conditions, workflow patterns that are often the better choice, tool design, context management, human approvals for risky actions, and evals that run each task several times. Labs run against a small simulated Acme world ([`env/`](env/): customers, invoices, deploys, tickets, the handbook). The project puts the agent in front of real Postgres tables.

## Learning objectives
By the end you can:
1. Decide between a single call, a **workflow** and an **agent**, and defend the choice with cost, latency and reliability.
2. Build a `ToolLoopAgent` with **several stop conditions** (done, step cap, token budget) and a trace that says *why* it stopped.
3. Implement routing, parallelisation, evaluator-optimizer and orchestrator-workers in plain TypeScript, with caps.
4. Design **task-shaped tools**: descriptions, bounded outputs, actionable errors, deterministic work in code.
5. Keep long runs affordable and correct with **tool-result clearing, notes and `prepareStep` rules**, and measure success, not just tokens.
6. Put **approvals** on risky tools (`toolApproval`), resume across requests, make side effects **idempotent**, and refuse forged approvals.
7. Evaluate agents on **final state + trajectory**, with **pass^k** over repeated trials.

## Prerequisites
- Phase 2 (tool calling, structured output, `useChat`) and Phase 3 (the handbook index: the project's search tool imports Phase 3's retrieval).
- `npm run db:up`, then `npm run ingest` in `phase-03-rag/project/reference` (for the project).

## 📺 Watch / read this first (in order, ~1 h 50 min)
1. **Anthropic: [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)** · 30 min. Workflows vs agents and the five patterns. The backbone of this phase.
2. **AI SDK docs: [Agents overview](https://ai-sdk.dev/docs/agents/overview)**, then [Building agents](https://ai-sdk.dev/docs/agents/building-agents) and [Loop control](https://ai-sdk.dev/docs/agents/loop-control) · 30 min. `ToolLoopAgent`, `stopWhen`, `prepareStep`: the API the labs use.
3. **Anthropic: [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)** · 20 min. Read it before Lab 03.
4. **Anthropic: [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)** · 20 min. Compaction, notes, sub-agents. Read it before Lab 04.
5. **Simon Willison: [The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)** · 10 min. The threat model behind Lab 05.

*(Optional, 30 min)* **[τ-bench](https://arxiv.org/abs/2406.12045)** (abstract + results). Where pass^k comes from, and how unreliable strong models were on realistic tool tasks.

## Work plan
| # | Item | Type | Time |
|---|---|---|---|
| 1 | [What an agent is](theory/01-what-is-an-agent.md) + [The agent loop](theory/02-the-agent-loop.md) + [loop stepper](visualizations/agent-loop.html) | theory + viz | 50 min |
| 2 | [Lab 01: ToolLoopAgent, stop conditions, traces](labs/01-tool-loop-agent) | lab | 60 min |
| 3 | [Workflow patterns](theory/03-workflows-vs-agents.md) + [patterns explorer](visualizations/workflow-patterns.html) | theory + viz | 30 min |
| 4 | [Lab 02: routing, voting, evaluator-optimizer, orchestrator-workers](labs/02-workflow-patterns) | lab | 60 min |
| 5 | [Tool design](theory/04-tool-design.md) | theory | 20 min |
| 6 | [Lab 03: task-shaped tools vs database-shaped tools](labs/03-tool-design) | lab | 45 min |
| 7 | [Context and memory](theory/05-context-and-memory.md) + [context growth viz](visualizations/context-growth.html) | theory + viz | 30 min |
| 8 | [Lab 04: clearing, notes, prepareStep rules](labs/04-context-management) | lab | 60 min |
| 9 | [Safety and human-in-the-loop](theory/06-safety-and-human-in-the-loop.md) + [approval flow viz](visualizations/approval-flow.html) | theory + viz | 35 min |
| 10 | [Lab 05: approvals, denial, idempotency](labs/05-human-in-the-loop) | lab | 60 min |
| 11 | [Evaluating agents](theory/07-evaluating-agents.md) + [pass^k viz](visualizations/pass-k.html) | theory + viz | 30 min |
| 12 | [Lab 06: outcome + trajectory graders, pass^k](labs/06-agent-evals) | lab | 75 min |
| 13 | [Project: Ops Copilot](project/) | project | 7–8 h |
| 14 | [Quiz + interview questions](quiz.md) | review | 30 min |

Suggested split at 5–6 h/day: **Day 1**: reading + items 1–4 · **Day 2**: items 5–10 · **Day 3**: items 11–12 + start the project · **Day 4**: finish the project, run the eval live, quiz.

## How to run things
```bash
npm run verify:p4          # all Phase 4 labs + project on scripted models (offline, free)
npm run verify:p4:live     # same, against your .env provider (slow: paced to 14 requests/min on Gemini's free tier)
npx tsx phase-04-agents/labs/05-human-in-the-loop/check.ts starter    # one lab, your code
```
**Rate limits are the main obstacle in live agent work.** Gemini's free tier allows 15 requests/minute for `gemini-3.5-flash-lite`, and one agent task is 3–10 requests. `shared/llm.ts` now wraps every model in a pacing middleware (`LLM_RPM`, default 14 for Gemini; `0` turns it off). Without it, Lab 06's first live run died with `429 RESOURCE_EXHAUSTED` within seconds.

## ⚠️ The concepts most people get wrong (flagged throughout)
1. **"Agents are the architecture; workflows are the simple version."** It's the other way round: workflows are the default, and autonomy is a cost you justify with a failure it fixes. → [01](theory/01-what-is-an-agent.md), [03](theory/03-workflows-vs-agents.md)
2. **"The system prompt says to ask before refunding."** A prompt is a suggestion. Approval gates, policy checks and idempotency live in **code**: Lab 05's "I am the CEO, pre-approved" still hit the gate, and the project rejects forged approvals. → [06](theory/06-safety-and-human-in-the-loop.md)
3. **"It worked when I tried it."** One run measures luck. The same code passed 15/15 and then 14/15 (pass^3 1.00 → 0.80). Report pass^k, grade the database, not the reply. → [07](theory/07-evaluating-agents.md)
4. **"Clearing context is free savings."** Clearing too early made Gemini re-search until the step cap, with no answer. Measure task success next to tokens. → [05](theory/05-context-and-memory.md)

## Real numbers measured while building this phase (2026-10-30, `gemini-3.5-flash-lite`)
| Observation | Value | Where |
|---|---|---|
| Live agent fixing the degraded api | 6 steps, 875 → 1,905 input tokens per step, 8,517 tokens in total | Lab 01 |
| Routing accuracy | 4/4 | Lab 02 |
| Parallel reviewers (3 × 300 ms) | 312 ms wall time vs ~900 ms sequential | Lab 02 |
| Evaluator-optimizer, same prompt twice | run 1 failed all 3 rounds · run 2 passed in round 3 | Lab 02 |
| Database-shaped vs task-shaped tools | 8 steps, 5,367 tokens, no answer · vs 2 steps, 588 tokens, correct | Lab 03 |
| Tool definitions cost per step | 7 environment tools ≈ 690 tokens | Lab 03 |
| Context clearing (scripted) / live without vs with enforced notes | −28% tokens / 1 of 2 runs thrashed to the step cap · 3/3 correct in 4–10 steps | Lab 04 |
| Approval round trip | refund paused → approved → executed in 2 rounds | Lab 05 |
| Agent eval suite, 5 tasks × 3 trials, run twice | 15/15, then 14/15 (pass^3 1.00 → 0.80) | Lab 06 |
| Free-tier pacing | 15 requests/min limit → `429` without client-side pacing | Lab 06 |

## ✅ What a senior should be able to explain after this phase
- [ ] When to use a single call, a workflow or an agent, with cost, latency and reliability arguments
- [ ] The agent loop, why its cost grows faster than its step count, and four stop conditions with the reason for each
- [ ] The five workflow patterns, with a production use case and a failure mode for each
- [ ] How to design a tool for a model: shape, description, bounded output, actionable errors, and where policy lives
- [ ] Context engineering for long runs (clearing, compaction, notes, sub-agents), its trade-offs, and its effect on prompt caching
- [ ] Human-in-the-loop with AI SDK 7 (`toolApproval`, approval parts, resuming), approval by risk, and why approvals must be signed or stored server-side
- [ ] Idempotency and concurrency for agent side effects (keys from the call id, row locks, unique constraints)
- [ ] The lethal trifecta, and how you'd remove a leg for a given agent
- [ ] Agent evals: outcome graders, trajectory rules, traps, pass@k vs pass^k, and keeping a live suite within rate limits
