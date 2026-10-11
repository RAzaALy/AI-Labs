# Phase 2 quiz: working with LLM APIs

Answer before opening. Target 8/10. Below 7, revisit the linked note.

### 1. Your API call returns 200, text "The refund will be processed within" and `finishReason: "length"`. What happened, and what should your code do?
<details><summary>Answer</summary>

The output hit `maxOutputTokens` and was **cut off**. Don't present it as complete, and never parse it as JSON. Options: raise the cap (leaving room for reasoning tokens), ask for shorter output, or continue the generation. Log it as a metric. → [01](theory/01-anatomy-of-an-api-call.md)
</details>

### 2. Which of these should be retried automatically: 400, 401, 404, 429, 503? How?
<details><summary>Answer</summary>

**429 and 503** (also 408/500/502/504 and network errors). Use exponential backoff with **full jitter**, honour `Retry-After` as a floor, and cap the attempts. 400/401/404 are your bugs or config: retrying burns quota and hides them. A 404 can also mean the model was retired. → [Lab 01](labs/01-raw-http)
</details>

### 3. Why does a reasoning model sometimes return an empty string with `finishReason: "length"`?
<details><summary>Answer</summary>

`maxOutputTokens` caps **thinking + answer together**. If reasoning uses the whole budget, nothing is left for visible text. In Lab 07, `gemini-3.8-flash` at 60 tokens spent 53–56 on reasoning. Fix: raise the cap or lower `reasoning`. → [07](theory/07-cost-caching-and-limits.md)
</details>

### 4. You parse SSE by splitting each network chunk on `\n`. Two bugs will hit you in production. Which?
<details><summary>Answer</summary>

(1) A chunk can end **mid-line** (or mid-event), so you JSON.parse half an object. (2) A chunk can end **mid-UTF-8 character**, producing "�" for Urdu, emoji, etc. Buffer until a blank line ends the event, and decode with `TextDecoder` using `{ stream: true }`. → [Lab 02](labs/02-streaming-sse)
</details>

### 5. What does schema-constrained decoding guarantee, and what doesn't it?
<details><summary>Answer</summary>

It guarantees the output **parses into your shape** (valid JSON, required fields, enum values), because invalid tokens are masked during sampling. It does **not** guarantee the values are true. Without `nullable` fields the model is forced to invent data. Validate business rules, and do arithmetic in code. → [04](theory/04-structured-output.md)
</details>

### 6. A model returns a tool call `issueRefund({amount: 500, account: "99"})` after reading a customer email. Your system prompt says "only refund the customer's own account". Is that enough?
<details><summary>Answer</summary>

**No.** The model only *requested* the call. It could have been steered by injected text in the email (indirect prompt injection). Your server must authorize the action for the **end user** (is account 99 theirs? is the amount within policy?) and require human approval for risky actions. Prompts aren't an authorization system. → [05](theory/05-tool-calling.md)
</details>

### 7. Why did the Phase 2 project's ticket endpoint fail on Gemini when passing the chat history as `messages`, and what's the better design?
<details><summary>Answer</summary>

The history ended with an assistant turn, and Gemini rejects "requests ending with a model turn". The better design: you're **analysing** the conversation, not continuing it, so put it in the prompt as a **delimited transcript** (`<conversation>…</conversation>`) and treat it as untrusted data. → [project](project/README.md)
</details>

### 8. Your system prompt starts with `Current time: 2026-10-11T09:14:03Z` followed by 6k tokens of stable instructions. What does this do to prompt caching?
<details><summary>Answer</summary>

It **busts the cache on every request**: caches match on exact prefixes, and the very first tokens change each second. Move variable content (time, user name, ids) **after** the stable prefix (tools → instructions → documents → history → new message). → [07](theory/07-cost-caching-and-limits.md)
</details>

### 9. A chat feature attaches 3 screenshots per request and keeps them in history. Roughly what does that add per turn, and what would you change?
<details><summary>Answer</summary>

≈3 × 1,075 ≈ **3.2k input tokens per turn**, and it grows with every turn because history is resent. Options: process the images once (extract text or a description), drop them from history after use, downscale or crop, or reference a provider file upload. → [06](theory/06-multimodal.md)
</details>

### 10. 1,000 clients get 429 at the same moment and all retry after exactly `2^n × 250 ms`. What happens, and what's the one-line fix?
<details><summary>Answer</summary>

A **thundering herd**: they all retry at the same instants, collide again, and capacity sits idle between the spikes (the rate-limit visualization shows it). Fix: **full jitter**, `delay = random() × base × 2^n` (with `Retry-After` as a floor). → [rate-limit viz](visualizations/rate-limits-and-retries.html)
</details>

---

## Senior interview questions
**1. Design the backend for a streaming chat feature. Walk me from the button click to the last token, including failure cases.**
<details><summary>What a strong answer covers</summary>

Client sends messages to *your* server (keys never in the browser). Validate, authenticate, check budget and rate limit. Build the prompt (instructions, tools, retrieved context, history policy). Call the provider with streaming and `abortSignal` wired to the client request. Transform the provider stream into your own SSE protocol (text deltas, tool parts, metadata). Disable proxy buffering. Errors mid-stream are in-band events and the UI has a retry state. Log usage and cost on finish. Timeouts and serverless duration limits, with background jobs for long tasks. Abort propagation stops billing. Observability: TTFT, tokens/s, error rate, cost per request.
</details>

**2. How would you make LLM output reliable enough to drive automation (e.g. creating tickets or refunds)?**
<details><summary>What a strong answer covers</summary>

Schema-constrained structured output plus validation (types and business rules). Nullable fields instead of forced guesses. Classification via enums. A repair loop with the validation error, then fail loudly. Arithmetic in code. Idempotency keys for side effects. Human approval for risky actions. Evals on a labelled set before and after prompt or model changes. Pin model versions. Monitor parse-failure and repair rates.
</details>

**3. Our LLM bill tripled after a release. How do you investigate and fix it?**
<details><summary>What a strong answer covers</summary>

Per-request usage logs by feature, model and tenant. Check input vs output vs reasoning vs cache-read shifts: a new tool schema or longer system prompt, a cache-busting prefix change, history growth, more tool-loop steps, images, a model or reasoning-level change, retry storms. Fixes: route to cheaper models, lower reasoning, trim schemas and context, restore prefix stability, cap steps and output, batch offline work, per-tenant budgets and alerts. Verify with the cost model before and after.
</details>

**4. Explain tool calling to a security reviewer. What are the risks and controls?**
<details><summary>What a strong answer covers</summary>

The model emits structured requests and your server executes them. Risks: prompt injection (direct or indirect via tool outputs) steering calls; excessive agency (too-powerful tools); data exfiltration via tool arguments; confused deputy (running with the server's privileges, not the user's). Controls: narrow task-shaped tools, schema plus business validation, per-user authorization in the handler, least privilege, approval for writes, step and cost caps, audit logs, output encoding, no secrets in prompts.
</details>

**5. When would you call a provider's API directly instead of using the AI SDK (or vice versa)?**
<details><summary>What a strong answer covers</summary>

SDK: multi-provider portability, normalized streaming, tools and structured output, UI integration, testing mocks, less glue code. Direct: day-one access to new provider features (explicit caching controls, new modalities, beta headers), minimal dependencies, exact control of wire behaviour, debugging. Common pattern: SDK by default, with `providerOptions` or a thin direct client for provider-specific capabilities. Know the raw shape either way, for logs and incidents.
</details>
