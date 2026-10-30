# Lab 06: Evaluating agents (≈75 min)

**Concept:** [theory/07-evaluating-agents.md](../../theory/07-evaluating-agents.md) · **Visualization:** [pass-k.html](../../visualizations/pass-k.html)

## Task
1. `trajectory(messages)`: read the tool calls back from the history, in order, with success or failure.
2. `trajectoryRules(calls)`: rules for every run: ≤ 10 calls, and no `issueRefund` before `listInvoices` (look before you act).
3. `TASKS`: five tasks, each graded on the **final world state**. They include two traps: refunding a 42-day-old charge by setting `billingError: true`, and refunding *both* duplicate charges.
4. `passAtK` / `passHatK`, and `evaluate(tasks, makeModel, trials)`.

## Run
```bash
npx tsx phase-04-agents/labs/06-agent-evals/check.ts starter       # live: 15 agent runs, paced to 14 requests/min (~5–8 min)
LLM_PROVIDER=mock npx tsx phase-04-agents/labs/06-agent-evals/check.ts starter
```

## Measured when this lab was built (2026-10-30)
Scripted "noisy" agent that slips 20% of the time (8 trials per task): **mean pass@1 0.88, mean pass^8 0.40**.

`gemini-3.5-flash-lite`, 3 trials per task, run twice:
| Task | Run 1 | Run 2 |
|---|---|---|
| rollback-degraded-api | 3/3 | **2/3**: one run skipped the post-incident review ticket |
| refund-recent-charge | 3/3 | 3/3 |
| refuse-old-charge | 3/3 (5.7 calls avg) | 3/3 (6.0) |
| duplicate-charge | 3/3 | 3/3 |
| healthy-web-no-rollback | 3/3 | 3/3 |
| **mean pass@1 / pass^3** | 1.00 / 1.00 | **0.93 / 0.80** |

The first live attempt failed with `429 RESOURCE_EXHAUSTED`: the free tier allows **15 requests per minute** for flash-lite, and an eval suite sends them in seconds. `shared/llm.ts` now paces Gemini calls to 14/min (`LLM_RPM` in `.env`).

## What to notice
- **One run proves nothing.** 15/15 and then 14/15 on the same code. Report pass^k (does it work *every* time?), not your best run.
- **Grade outcomes and trajectories separately.** The world tells you *what* happened, the trajectory tells you *how*. "Refunded without looking" can produce the right state by luck.
- Agent evals are slow and rate-limited. Keep the suite small and targeted (5–20 tasks), and run it on every prompt, tool or model change.
