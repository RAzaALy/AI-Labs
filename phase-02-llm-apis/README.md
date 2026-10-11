# Phase 2: Working with LLM APIs

**Level:** Base · **Time budget:** ~20 h (4 days at 5–6 h/day, or weeks 2–3 of the 12-week plan) · **Keys:** optional. Everything runs on a mock model offline; with a free **Gemini** key in `.env` every lab also runs live.

Phase 1 was the engine; this phase is the API you'll build on for the rest of the course: raw HTTP → SDK, prompting as code, streaming, structured output, tool calling, multimodal input, and the economics (tokens, caching, reasoning, rate limits). It ends with a real Next.js app.

## Learning objectives
By the end you can:
1. Call an LLM with plain `fetch` in two wire formats (Gemini native, OpenAI-compatible), normalize the response, and handle errors with **jittered exponential backoff**.
2. Write production-shaped prompts (definitions, examples, delimited untrusted input, exact output), and **test them with an eval**.
3. Stream over SSE end to end: parse it, measure TTFT and tokens/s, and propagate **abort**.
4. Get **schema-validated** objects back (`Output.object` / `choice` / `array`), stream partial objects, and repair failures.
5. Implement the **tool-calling loop** by hand and with the SDK, with errors as data and step caps, and explain where authorization lives.
6. Send images and PDFs and budget their token cost.
7. Meter cost precisely (cached input, **hidden reasoning tokens**), guard budgets, and use caching and model choice as cost levers.

## Prerequisites
- Phase 1 done (tokens, context windows, sampling, statelessness).
- Optional: a free key from [Google AI Studio](https://aistudio.google.com/apikey) in the repo-root `.env` (see [`.env.example`](../.env.example)).

## 📺 Watch / read this first (in order, ~2 h)
1. **AI SDK docs: [Foundations overview](https://ai-sdk.dev/docs/foundations/overview) + [Prompts](https://ai-sdk.dev/docs/foundations/prompts)** · 20 min. The vocabulary the labs use.
2. **Anthropic: [Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)** and the best-practices page it links · 40 min. The clearest primary source on prompting; it applies beyond Claude.
3. **AI SDK docs: [Tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)** · 25 min.
4. **Gemini docs: [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [Function calling](https://ai.google.dev/gemini-api/docs/function-calling)** · 20 min. See the provider view of the same features.
5. **AWS Architecture Blog: [Exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)** · 15 min. The classic behind Lab 01's retry code.

*(Optional, 4–6 h)* [Anthropic's prompt-engineering interactive tutorial](https://github.com/anthropics/courses/tree/master/prompt_engineering_interactive_tutorial): Python notebooks, but language-agnostic lessons.

## Work plan
| # | Item | Type | Time |
|---|---|---|---|
| 1 | [Anatomy of an API call](theory/01-anatomy-of-an-api-call.md) + [request anatomy viz](visualizations/api-request-anatomy.html) | theory + viz | 40 min |
| 2 | [Lab 01: raw HTTP, two wire formats, retries](labs/01-raw-http) | lab | 60 min |
| 3 | [Streaming](theory/03-streaming.md) + [SSE viz](visualizations/streaming-sse.html) | theory + viz | 30 min |
| 4 | [Lab 02: SSE by hand, TTFT, abort](labs/02-streaming-sse) | lab | 60 min |
| 5 | [Prompting for engineers](theory/02-prompting.md) | theory | 30 min |
| 6 | [Lab 03: AI SDK + prompts as tested code](labs/03-ai-sdk-and-prompts) | lab | 75 min |
| 7 | [Structured output](theory/04-structured-output.md) + [constrained decoding viz](visualizations/structured-output.html) | theory + viz | 35 min |
| 8 | [Lab 04: structured output](labs/04-structured-output) | lab | 60 min |
| 9 | [Tool calling](theory/05-tool-calling.md) + [tool loop viz](visualizations/tool-calling-loop.html) | theory + viz | 40 min |
| 10 | [Lab 05: tool calling by hand and with the SDK](labs/05-tool-calling) | lab | 75 min |
| 11 | [Multimodal](theory/06-multimodal.md) + [Lab 06](labs/06-multimodal) | theory + lab | 60 min |
| 12 | [Cost, caching, limits](theory/07-cost-caching-and-limits.md) + [cost calculator](visualizations/cost-calculator.html) + [rate-limit viz](visualizations/rate-limits-and-retries.html) | theory + viz | 50 min |
| 13 | [Lab 07: cost meter, hidden tokens, caching](labs/07-cost-and-caching) | lab | 45 min |
| 14 | [Project: Support Copilot](project/) | project | 6–7 h |
| 15 | [Quiz + interview questions](quiz.md) | review | 30 min |

Suggested split at 5–6 h/day: **Day 3**: reading + items 1–4 · **Day 4**: items 5–10 · **Day 5**: items 11–13 + start the project · **Day 6**: finish the project + quiz.

## How to run things
```bash
npm run verify:p2          # all Phase 2 labs + project, MOCK model (offline, free, deterministic)
npm run verify:p2:live     # same, against the provider in your .env (uses free-tier quota)
npx tsx phase-02-llm-apis/labs/03-ai-sdk-and-prompts/check.ts starter   # one lab, your code
```
`shared/llm.ts` picks the model: `LLM_PROVIDER` → first key found (Gemini → Groq → OpenRouter → Anthropic → OpenAI) → mock.

**Free-tier quota reality:** the default "fast" model (`gemini-3.5-flash-lite`) has a generous free daily allowance. The "smart" model (`gemini-3.8-flash`, used by Lab 07's reasoning comparison and the project's *smart* option) allows **very few free requests per day**. While building this phase it returned `429 "You exceeded your current quota"` after a few dozen calls. Live checks that hit a quota or `503 high demand` are reported as **⚠️ SKIPPED (provider unavailable)**, not as failures. Rerun them the next day. Your real per-model limits are in [AI Studio](https://aistudio.google.com/) under your project's rate limits.

## ⚠️ The concepts most people get wrong (flagged throughout)
1. **"The model runs my tools."** It emits a JSON *request*; your code executes it and owns authorization. → [05](theory/05-tool-calling.md)
2. **"`max_tokens` caps the answer."** It caps **thinking + answer**. A reasoning model with a small cap returned an **empty answer** in Lab 07. → [07](theory/07-cost-caching-and-limits.md)
3. **"Ask for JSON in the prompt and parse it."** Use schema-constrained output and validate it, and never act on partial objects. → [04](theory/04-structured-output.md)
4. **"Retry on any error, immediately."** Retry only 408/429/5xx, with jitter, honouring `Retry-After`. → [01](theory/01-anatomy-of-an-api-call.md)

## Real numbers measured while building this phase (Gemini free tier, 2026-10-11)
| Observation | Value | Where |
|---|---|---|
| TTFT / decode speed (`gemini-3.5-flash-lite`) | ~1,000 ms / ~200 tok/s | Lab 02 |
| Hidden thinking for "pong" (`gemini-3.5-flash`) | 99 tokens for a 1-token answer | Lab 01 |
| Same one-sentence answer, `reasoning: 'low'` vs default | $0.000109 vs $0.001246 (11×) | Lab 07 |
| One 400×240 PNG | ≈1,075 input tokens | Lab 06 |
| Implicit cache hit on a 5.8k-token prefix | 2,035 tokens on calls 2–3, ~30% cheaper; best-effort | Lab 07 |
| 3-step tool loop | 928 input tokens | Lab 05 |

## ✅ What a senior should be able to explain after this phase
- [ ] The request/response of two provider APIs, which fields matter, and which errors to retry and how
- [ ] Why `finish_reason` must be checked, and what `length` means for JSON and for reasoning models
- [ ] A production prompt's anatomy, and why prompts need evals the way code needs tests
- [ ] SSE framing, TTFT vs throughput, abort propagation, and three ways infrastructure breaks streaming
- [ ] Constrained decoding vs JSON mode vs prompt-only JSON; why schemas guarantee shape, not truth
- [ ] The tool-calling loop without a framework, where authorization lives, and why tool output is untrusted input
- [ ] The token cost of images and PDFs, and when to extract text instead
- [ ] A feature's monthly cost including reasoning and cache effects, and the top levers to cut it
- [ ] How AI SDK 7 differs from older examples online (`instructions`, `isStepCount`, `output`, `file` parts, `onEnd`)
