# 4. Tool design: the agent-computer interface

**Time:** 20 min · **Lab:** [`labs/03-tool-design`](../labs/03-tool-design)

## The idea
To the model, your tools **are** the system. It sees only names, descriptions, input schemas, outputs and errors. Design them for the *task*, not the database:

- **Task-shaped, consolidated tools.** One `lookupCustomerBilling(customer)` beats `findCustomers` → `listInvoices` → date arithmetic. Fewer steps, fewer chances to go wrong.
- **Descriptions that say when and how**: purpose, when to use it, id formats (`C-123`, `INV-YYYYMMDD`), what comes back.
- **High-signal, bounded outputs.** Return the fields that matter, computed values (refundable amount, days ago) and sources, and cap sizes. Paginate or filter.
- **Errors that are next steps**: "matches C-102 and C-103. Call again with the id", not `ERR_TABLE`. Internal failures get a generic message and must not leak internals.
- **Safety in the tool**: validate inputs, enforce policy, derive idempotency keys from the call (not from model text), and require approval for risky actions.

## Web-engineering analogy
It's **API design for a junior developer who reads only your OpenAPI spec and can't ask questions**. Clear endpoint names, examples in the docs, actionable 4xx messages, no 5xx stack traces.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Many fine-grained tools | Flexible | More definition tokens per step, more wrong choices, more steps |
| Few task-shaped tools | Fast, reliable on known tasks | Less flexible; new tasks need new tools |
| Long descriptions | Fewer mistakes | Tokens on every step (Lab 03: 7 tools ≈ 690 tokens/step) |

## What Lab 03 measured
Same question, same model: **bad tools hit the 8-step cap with no answer (5,367 tokens)**. Good tools answered correctly in **2 steps (588 tokens)**. The raw `docs()` tool also returned the deprecated 14-day refund policy.

## ⚠️ Common mistakes
1. **Wrapping every REST endpoint as a tool.** The model then has to orchestrate your microservices.
2. **Returning whole records or documents.** Context fills up with noise, and stale content rides along.
3. **Leaving arithmetic, dates and policy checks to the model.**
4. **Vague names** (`query`, `get_data`) and **unformatted ids** in descriptions.

## Senior check
You can review a tool set and name what to merge, what to bound, how errors should read, and where policy checks belong.
