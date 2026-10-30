# Lab 03: Tool design, the agent-computer interface (≈45 min)

**Concept:** [theory/04-tool-design.md](../../theory/04-tool-design.md)

## Task
`badTools` (given) exposes the database as-is: `query({table, where})` and `docs({q})`. Build the replacements:
1. `lookupCustomerBilling(ops, customer)`: one **task-shaped** tool that accepts a name, email or id and returns the customer plus invoices with `refundableUSD` and `withinRefundWindow` **computed in code**. Ambiguous or empty matches throw a `ToolError` that says what to do next.
2. `actionableError(e)`: `ToolError` messages pass through. Anything else becomes a generic "internal error, don't retry blindly" message with no internals.
3. `searchPolicy(query)`: at most 3 excerpts, each ≤ 500 characters, **with a source**, current docs only.
4. `goodTools(ops)`: wire them up, with errors returned as data.
5. `definitionTokens(tools)`: what your tool definitions cost on **every** step.

## Run
```bash
npx tsx phase-04-agents/labs/03-tool-design/check.ts starter
LLM_PROVIDER=mock npx tsx phase-04-agents/labs/03-tool-design/check.ts starter
```

## Measured when this lab was built (2026-10-30, `gemini-3.5-flash-lite`)
"Which of Ayesha Khan's invoices can still be refunded?"
| Toolset | Steps | Input tokens | Result |
|---|---|---|---|
| bad (`query`, `docs`) | 8 (step cap hit) | 5,367 | ✗ no answer: kept querying tables and dumping docs |
| good (`lookupCustomerBilling`, `searchPolicy`) | 2 | 588 | ✓ INV-20261003, "12 days ago, within the 30-day window" |

Also measured: `docs("refund")` = 463 tokens, **including the deprecated 14-day policy**, while `searchPolicy` = 160 tokens of current policy only. Tool definitions cost bad 125, good 200, and all 7 environment tools 690 tokens per step.

## What to notice
- **Good descriptions cost more tokens and save whole steps.** Tool definitions are a tax on every call, so trim what the model doesn't need, not what it does.
- **Do the deterministic work in the tool.** Date arithmetic, refundable amounts and policy windows are code. Models are bad at them and you can't unit-test a prompt.
- **An error message is a prompt.** "ERR_TABLE" gives the model nothing. "Matches C-102 Bilal Ahmed, C-103 Northwind Ltd. Call again with the id" is the next step.
