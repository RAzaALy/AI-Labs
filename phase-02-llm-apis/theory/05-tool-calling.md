# 5. Tool (function) calling

**Time:** 25 min · **Visualization:** [`tool-calling-loop.html`](../visualizations/tool-calling-loop.html) · **Lab:** [`labs/05-tool-calling`](../labs/05-tool-calling)

## The idea
You describe functions (name, description, JSON-schema input). The model can respond with a **request to call one** instead of text. **Your code** executes it, appends the result to the conversation, and calls the model again. The loop ends when the model answers in text, or when you stop it.

```
messages → model → tool_call(getOrderStatus, {orderId}) → YOUR CODE runs it → tool_result → model → … → final text
```

⚠️ **The model never executes anything (one of the four big misconceptions).** It emits JSON. Whether that call runs, as which user, with what permissions, rate limits and audit log, is decided by your code. Prompting a model "not to delete things" is not an authorization system.

## Web-engineering analogy
Tool calling is the model **issuing RPC requests that your backend brokers**. The tool schema is an **OpenAPI spec for an LLM client**, `execute` is the **handler**, and the loop is a **request/response cycle repeated until done**. Authorization belongs in the handler, scoped to the *end user's* identity, never to the model's say-so.

## Designing good tools
- **Names and descriptions are prompts.** Say when to use the tool, what it returns, input formats (`ORD-1234`) and units.
- **Narrow and task-shaped** (`getOrderStatus(orderId)`), not generic (`runSQL(query)`). Generic tools are powerful and dangerous.
- **Return compact, model-readable results.** A 5 MB JSON dump costs tokens on every subsequent step.
- **Errors are results.** Return `"Order ORD-404 not found. Ask the user to double-check"` to the model instead of throwing a 500. It will recover gracefully (Lab 05).
- **Idempotent reads freely, side effects carefully.** Writes, payments and emails need confirmation or approval (human-in-the-loop, Phase 4).

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Many fine-grained tools | Precise | Every schema is sent on every step (tokens, and confusion past ~20 tools) |
| Few broad tools | Fewer tokens | Model misuses parameters; harder to authorize |
| Parallel tool calls | Lower latency | Ordering/consistency issues for writes |
| SDK-managed loop (`stopWhen`) | Little code | Easy to forget caps, approvals and auditing |

## ⚠️ Common mistakes
1. **No step cap**, so a confused model loops forever and burns money. Always `stopWhen: isStepCount(n)` plus a cost budget.
2. **Trusting tool inputs.** They're model-generated, which means **user-influenced** (prompt injection). Validate with the schema *and* business rules, and authorize per user.
3. **Forgetting statelessness.** Tool results must be appended to messages and resent. Live, Lab 05's 3-step loop used 928 input tokens.
4. **Dumping huge tool outputs** into context. Summarize or paginate.
5. **Leaking internals in errors** (stack traces, SQL) back to the model and then to the user.

## Senior check
You can implement the loop without a framework, explain where authorization lives, and design a tool set for a support bot with safe read/write boundaries.
