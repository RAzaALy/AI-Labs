# 7. Cost, caching and rate limits

**Time:** 30 min · **Visualizations:** [`cost-calculator.html`](../visualizations/cost-calculator.html), [`rate-limits-and-retries.html`](../visualizations/rate-limits-and-retries.html) · **Lab:** [`labs/07-cost-and-caching`](../labs/07-cost-and-caching)

## The idea
**Cost = Σ tokens × price**, where the token categories have very different prices:

| Category | Price vs base input | Notes |
|---|---|---|
| Fresh input | 1× | everything not served from cache |
| Cache write | 1.25× (Anthropic 5 min) / 2× (1 h); others 1× | first time a prefix is stored |
| Cache read | **0.05–0.1×** (Claude Sonnet/Opus 5.5: 0.05×; Gemini 3.x, OpenAI: ~0.1×) | repeated identical prefixes |
| Output | **4–8× input** | includes **hidden reasoning tokens** |
| Batch API | **0.5×** everything | async, results within hours |

Current prices (verified 2026-10-11, per 1M tokens, input / output): Claude Sonnet 5.5 $2 / $10 · Haiku 5.5 $0.10 / $0.50 · GPT-6.1 Sol $2 / $10 · GPT-6 Luna $0.10 / $0.50 · Gemini 3.5 Flash-Lite $0.30 / $2.50 · Gemini 3.8 Flash $0.75 / $3.75 (doubles in 2027). The **model choice is a 20–100× lever**, bigger than any prompt trick.

### Hidden reasoning tokens
Lab 07, `gemini-3.8-flash`, one-sentence question: **304 reasoning tokens + 26 visible**, 11× the cost of `reasoning: 'low'`, for the same answer. And `maxOutputTokens` caps thinking + answer together: at 60, the model returned an **empty or truncated answer**.

### Prompt caching
Providers reuse the KV cache (Phase 1) for an **identical prefix** across requests and bill it at a discount.
- **Implicit** (OpenAI, Gemini): automatic but **best-effort**. Lab 07 saw a 2,035-token hit on calls 2–3 of one run and a miss on call 3 of another.
- **Explicit** (Anthropic `cache_control` breakpoints, Gemini `cachedContents`): guaranteed within the TTL, but you pay a write premium. It pays off after 1–2 reads.
- **Prefix discipline:** tools → system → documents → history → new message. Anything that changes (a timestamp in the system prompt!) invalidates everything after it.

### Rate limits
Measured per minute and per day in **requests (RPM/RPD) and tokens (TPM)**, per project or org, per model. Free tiers are small and change without notice: check your project's real limits in the provider console. Handle 429 with **exponential backoff + full jitter + `Retry-After`** (Lab 01), and smooth load with a client-side token bucket or a queue (Phase 7).

## Web-engineering analogy
Tokens are **metered compute like cloud egress**: input is cheap reads, output is expensive writes. Prompt caching is a **CDN for the prefix of your request**: same bytes, same cache key, cheap hits, and a single changed byte early on is a full miss. Rate limits are **API gateway quotas**, and jittered backoff prevents the **thundering herd** you'd avoid in any distributed system.

## Cost levers, biggest first
1. **Right-size the model:** route easy requests to Haiku/Luna/Flash-Lite and escalate only when needed.
2. **Control reasoning:** `reasoning: 'low'` or `'none'` for extraction and classification.
3. **Shrink input:** retrieve top-k instead of stuffing docs, summarize history, trim tool schemas, downscale images.
4. **Cap output:** concise instructions, `maxOutputTokens` with headroom for reasoning, structured output instead of essays.
5. **Cache stable prefixes.**
6. **Batch** offline workloads at 50% off.
7. **Budget and alert** per user or tenant: pre-flight guards (`assertCanAfford`), hard caps, dashboards (Phase 7).

## ⚠️ Common mistakes
1. **Ignoring reasoning tokens** in cost estimates and meters. They're output tokens, sometimes 90% of them.
2. **Small `maxOutputTokens` on a reasoning model**, which gives empty answers with `finishReason: 'length'`.
3. **Cache-busting prefixes:** timestamps, user names or random ids at the top of the system prompt.
4. **Assuming implicit caching** in your cost model. Budget without it, and treat hits as a bonus.
5. **Retrying in lockstep** after 429s, which re-triggers the limit for everyone (no jitter).
6. **Free-tier assumptions in production.** Free tiers have tiny daily caps and may use your data for training. Read the terms.

## Senior check
You can estimate a feature's monthly bill including reasoning and cache effects, name the top three levers to cut it, and design 429 handling that doesn't create a thundering herd.
