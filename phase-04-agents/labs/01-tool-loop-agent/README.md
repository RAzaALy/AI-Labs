# Lab 01: The tool-loop agent (≈60 min)

**Concept:** [theory/02-the-agent-loop.md](../../theory/02-the-agent-loop.md) · **Visualization:** [agent-loop.html](../../visualizations/agent-loop.html) · **Environment:** [`env/acme-ops.ts`](../../env/acme-ops.ts) (customers, invoices, deploys, tickets, handbook search) and [`env/tools.ts`](../../env/tools.ts)

## Task
1. `tokenBudget(maxTokens)`: a custom **stop condition** that fires once input + output tokens summed over all steps reach the budget.
2. `createOpsAgent(ops, model)`: a `ToolLoopAgent` with the Acme tools plus a `done` tool, stopping on `hasToolCall('done')`, `isStepCount(n)` or the token budget, whichever comes first.
3. `runTask(agent, task)`: run it and return a **trace** (per step: tool calls, errors, tokens) and **why it stopped** (`done` / `max-steps` / `budget` / `answered`).

## Run
```bash
npx tsx phase-04-agents/labs/01-tool-loop-agent/check.ts starter                    # live (uses .env)
LLM_PROVIDER=mock npx tsx phase-04-agents/labs/01-tool-loop-agent/check.ts starter  # scripted model, offline
```

## Measured when this lab was built (2026-10-30, `gemini-3.5-flash-lite`)
Task: "Customers report errors from the API since this morning. Investigate and fix it following our handbook."
```
1. getDeployStatus(api)                       875 input tokens
2. searchHandbook("degraded service rollback incident")      991
3. searchHandbook("post incident review ticket required SRE")  1263
4. rollback(api)                                            1545
5. createTicket("Post-Incident Review: API Service Rollback") 1654
6. done(...)                                                1905   → 8,517 tokens in total
```
The model found the "open a post-incident review ticket within 24 hours" rule on its own, by searching the handbook a second time.

## What to notice
- **The check grades the world, not the words.** "api is healthy, web and worker untouched, a ticket exists" is a test. "The answer sounds right" isn't.
- **Errors are data.** The failed `listInvoices("Ayesha")` call returned "Use findCustomers(query) to look up the id first", and the next request carried that text. That's how the agent recovered.
- **Cost grows faster than steps.** Every step re-sends everything before it (113 → 414 → 568 → 788 tokens in the scripted run). Six steps can cost ten single calls.
- **Always have more than one stop condition.** `done` is the happy path. The step cap and the token budget are the seatbelts for when the model never calls it.
