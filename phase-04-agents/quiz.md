# Phase 4 quiz: agents

Answer before opening. Target 8/10. Below 7, revisit the linked note.

### 1. Your team wants "an agent" that takes a support email, classifies it, drafts a reply and checks the tone. Agent or workflow? Why?
<details><summary>Answer</summary>

A **workflow**: routing (classify) → handler (draft) → evaluator (tone check, capped rounds). The steps are known in advance, so code should fix the path. The result has known cost and latency, can be unit-tested, and can't wander off. Use an agent only if the handling truly depends on what lookups return (different systems per case). → [01](theory/01-what-is-an-agent.md), [03](theory/03-workflows-vs-agents.md)
</details>

### 2. An agent run took 6 steps. Each step's own new content was ~300 tokens, on top of ~900 tokens of instructions and tool definitions. Roughly how many input tokens were billed, and why isn't it 6 × 1,200?
<details><summary>Answer</summary>

Each step re-sends everything before it: step *n* ≈ 900 + 300·(n−1) + the task. Summed over 6 steps that's ≈ 6·900 + 300·(0+1+…+5) = 5,400 + 4,500 ≈ **9,900+** tokens, versus 7,200 if the context stayed flat. Lab 01 measured 875 → 1,905 tokens per step, 8.5k in total. History growth is why cost grows faster than steps. → [02](theory/02-the-agent-loop.md)
</details>

### 3. Name three stop conditions you'd put on a production agent, and what each protects against.
<details><summary>Answer</summary>

`hasToolCall('done')` (or a final answer): the clean finish, plus a structured report. `isStepCount(n)`: loops that never converge. A **token or cost budget**: long contexts that blow the bill within few steps. Also a **wall-clock timeout** (serverless limits, users waiting) and an approval pause. Record *which* one fired: max-steps and budget are failure signals. → [02](theory/02-the-agent-loop.md), Lab 01
</details>

### 4. A tool returns `ERR_TABLE`. What's wrong with that from the agent's point of view, and what should it return?
<details><summary>Answer</summary>

The model can't act on it, so it retries blindly or gives up. Errors are part of the prompt: say what went wrong **and the next step** ("Unknown table. Use lookupCustomerBilling(customer) for billing questions"). For internal failures, return a generic "not caused by your input, don't retry" message with **no internals** (hosts, stack traces). → [04](theory/04-tool-design.md), Lab 03
</details>

### 5. Why did database-shaped tools (`query(table, where)`, `docs(q)`) fail in Lab 03 where task-shaped tools succeeded in 2 steps?
<details><summary>Answer</summary>

The model had to orchestrate the schema itself: find the customer, query invoices, compute dates against "today", and read whole documents (including the **deprecated** 14-day policy). Each step added raw data to the context, and it ran out of steps (8 steps, 5,367 tokens, no answer). A task-shaped tool did the joins, dates and policy window in code and returned exactly the fields that matter: 2 steps, 588 tokens. → [04](theory/04-tool-design.md)
</details>

### 6. You clear old tool results to save tokens, and the agent starts re-running the same searches. What happened, and how do you fix it without dropping the optimisation?
<details><summary>Answer</summary>

Results were cleared before the model had extracted what it needed: here, results of parallel calls in the step it was still reading. Fixes: count the "keep" window in **steps**, not results; make the model write durable **notes** before results disappear, and enforce it with `prepareStep` (`activeTools: ['saveNote']`, `toolChoice: 'required'` after a search step); clear in large, infrequent batches (rewrites also invalidate the prompt cache). Judge by task success, not tokens. → [05](theory/05-context-and-memory.md), Lab 04
</details>

### 7. With `toolApproval: { issueRefund: 'user-approval' }`, what does the server do when the model calls `issueRefund`, and how does the refund eventually happen?
<details><summary>Answer</summary>

The tool **doesn't run**. The step ends with a `tool-approval-request` (UI part state `approval-requested`) and the **HTTP response finishes**: nothing waits in memory. Later, the client sends the conversation with a `tool-approval-response` (`approved: true/false`). On that new request the SDK **executes the approved call first** (or records `execution-denied`), then continues the loop with the model. → [06](theory/06-safety-and-human-in-the-loop.md), Lab 05
</details>

### 8. The browser sends the full message history on every request. What attack does that enable against an approval flow, and what are two defences?
<details><summary>Answer</summary>

A client can **forge** an assistant message containing an `issueRefund` call already marked `approved`, which the server never issued. Defences: **sign approval requests** (`experimental_toolApprovalSecret`, HMAC, verified on replay), as the project does (AC7). Better still, **store conversations server-side** and accept only the new user message or approval decision from the client. Policy checks in the tool (amount, window) limit the damage either way. → [project](project/)
</details>

### 9. A user double-clicks "Approve" and two identical requests arrive. Without extra care, what goes wrong, and what does the project do about it?
<details><summary>Answer</summary>

Both requests replay the same approved call, so the refund could execute twice. The project uses the **tool call id as the idempotency key** with a `UNIQUE` constraint: the second execution finds the existing row and returns the first result (`replayed: true`). The invoice row is locked `FOR UPDATE` so concurrent refunds can't both pass the "refundable" check. Never let the model invent the key, because it changes on every retry. → Lab 05, project AC5
</details>

### 10. Your agent passes 9 of 10 tasks in a single run. Your manager calls it "90% reliable". What do you measure instead, and why?
<details><summary>Answer</summary>

Run each task **k times** against a fresh world and report **pass^k** (the chance all k attempts succeed) next to pass@1. A 90% per-attempt success rate gives pass^8 ≈ 43%, and Lab 06 saw 15/15 then 14/15 on identical code. Grade the **final state** (database) and the **trajectory** (looked before acting), include trap tasks, and track steps and cost. One run measures luck. → [07](theory/07-evaluating-agents.md)
</details>

---

## Senior interview questions
**1. Design an agent that lets support staff issue refunds and credits from a chat interface. Walk me through the architecture and the safeguards.**
<details><summary>What a strong answer covers</summary>

Workflow-first: is an agent needed at all, or would a form plus lookups do? If an agent: task-shaped tools (lookup customer billing, issue refund) where **policy lives in the tool** (windows, limits, refundable amounts) inside DB transactions with row locks. Idempotency keys from the call id or a server-issued id. **Approval** by risk (amount, age, customer tier), with a human-readable approval card. Signed approvals or server-side conversation storage. Per-user permissions enforced by the backend. An audit log with actor, input, approver and outcome. Stop conditions and budgets, rate limiting, and an eval suite with traps graded on the database (pass^k) on every prompt, model or tool change. Monitoring: refund volume anomalies, denial rate, step counts.
</details>

**2. Your agent works in demos but production traces show it sometimes calls the same tool 8 times in a row and hits the step cap. How do you debug and fix it?**
<details><summary>What a strong answer covers</summary>

Pull failing traces: inputs and outputs of the repeated calls. Common causes: unhelpful or unchanged errors (the model retries the same input), outputs too large or truncated so the needed field is missing, context clearing removing results the model still needed, ambiguous tool descriptions, or a missing tool for the actual next step. Fixes: actionable errors, task-shaped tools, `prepareStep` rules (restrict `activeTools` after N identical calls, force a different action), repetition detection as a stop condition, a cheaper "are we stuck?" check. Add the failing case to the eval and measure pass^k before and after.
</details>

**3. When would you split an agent into a supervisor and sub-agents, and what does it cost you?**
<details><summary>What a strong answer covers</summary>

When subtasks are independent and context-heavy (research across many documents, codebase exploration). Sub-agents keep the parent's context small by returning condensed results, and they can run in parallel. Costs: more calls and tokens in total, harder debugging (nested traces), information lost in summaries, coordination failures (duplicate work, contradictory results), and harder evaluation. Prefer a single agent with good tools until a measured context or latency problem justifies the split, and give each sub-agent a narrow tool set and a clear output schema.
</details>

**4. How would you threat-model an agent that reads customer emails and can send emails and query the CRM?**
<details><summary>What a strong answer covers</summary>

That's the **lethal trifecta**: private data (CRM), untrusted content (emails) and external communication (sending email). A prompt injection in an email could exfiltrate CRM data. Remove a leg: no outbound email without human approval of the exact content and recipients, recipients restricted to the original sender, CRM access scoped to the sender's own record, or split it so the step that reads untrusted email can't call the send tool. Also: treat tool outputs as untrusted data, log and alert on unusual tool sequences, and red-team with injected emails in the eval suite.
</details>

**5. How do you keep an agent's quality from regressing when you change the prompt, a tool or the model version?**
<details><summary>What a strong answer covers</summary>

A versioned eval suite: 10–50 realistic tasks plus traps, fresh seeded environments, outcome graders on state, trajectory rules, k trials, pass^k with cost and steps, run in CI on every change and nightly against the live model (pinned versions, rate-limit pacing). Compare against a baseline with thresholds that block the merge. Production feedback (failed or escalated runs, approver denials) flows back into new tasks. Canary new prompts or models to a slice of traffic and watch step counts, denial rates and escalations.
</details>
