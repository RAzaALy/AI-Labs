# Lab 02: Workflow patterns (≈60 min)

**Concept:** [theory/03-workflows-vs-agents.md](../../theory/03-workflows-vs-agents.md) · **Visualization:** [workflow-patterns.html](../../visualizations/workflow-patterns.html)

## Task
Four patterns from Anthropic's *Building effective agents*, each in ~15 lines. Your code decides the path, not the model:
1. `route`: classify with `Output.choice`, then call a specialised handler prompt.
2. `parallelReview`: three reviewers **concurrently** (`Promise.all`), majority vote in code.
3. `evaluatorOptimizer`: draft → structured verdict → revise, with a **hard cap** on rounds.
4. `orchestratorWorkers`: plan subtasks (`Output.object`), run workers in parallel, then synthesise.

## Run
```bash
npx tsx phase-04-agents/labs/02-workflow-patterns/check.ts starter
LLM_PROVIDER=mock npx tsx phase-04-agents/labs/02-workflow-patterns/check.ts starter
```

## Measured when this lab was built (2026-10-30, `gemini-3.5-flash-lite`)
- Routing: **4/4** messages to the right handler.
- Parallel review (mock, 300 ms per call): **312 ms** for 3 reviewers vs ~900 ms sequential, with 3 calls in flight at once.
- Evaluator-optimizer on "reply to Ayesha without promising a refund, mention the 30-day window, ≤ 2 sentences": **run 1 never passed in 3 rounds; run 2 passed in round 3**. Same prompt, temperature 0. The reviewer's feedback was sharp ("implies that approval is guaranteed"), but the writer kept almost fixing it.

## What to notice
- A workflow's cost and latency are **known in advance**: routing is always 2 calls, voting is always 3 parallel calls. An agent's aren't.
- **Caps are not optional.** An evaluator that is never satisfied would loop forever. 3 rounds, then ship the best attempt or escalate.
- Aggregation (votes, merges) belongs in **code**. Asking a fourth LLM call "do the reviewers agree?" adds cost and a new failure mode.
