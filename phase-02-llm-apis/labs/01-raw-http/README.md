# Lab 01: An LLM call with nothing but fetch() (≈60 min)

**Concept:** [theory/01-anatomy-of-an-api-call.md](../../theory/01-anatomy-of-an-api-call.md) · **Key:** optional. Checks run against a local fake server; with a Gemini key one extra check runs live.

Every SDK hides the same thing: an HTTPS POST with a JSON body. Before using the AI SDK, you'll write the request and response handling yourself for **two wire formats**:
- **Gemini native** (`generateContent`): `systemInstruction` separate from `contents`, roles `user`/`model`, usage in `usageMetadata`.
- **OpenAI-compatible** (`/chat/completions`): system is just the first message, usage in `usage`. Groq, OpenRouter, Ollama, vLLM and Gemini's `/openai` endpoint all speak it.

## Task
In `starter/index.ts`:
1. `buildGeminiBody` / `parseGeminiResponse`
2. `buildOpenAIBody` / `parseOpenAIResponse`, normalizing both into one `ChatResult` (text, finish reason, usage **including hidden reasoning tokens**)
3. `callGemini` / `callOpenAICompatible` using the provided `postJson` (API key in a **header**, never the URL)
4. `withRetry`: exponential backoff with **full jitter**, honour `Retry-After`, retry only 408/429/5xx, never 4xx

## Run
```bash
npx tsx phase-02-llm-apis/labs/01-raw-http/check.ts starter
```

## What to notice
- `gemini-3.5-flash` returned 1 visible token ("pong") and **99 hidden thinking tokens**, all billed as output. If your parser ignores `thoughtsTokenCount`, your cost meter is wrong by 100×.
- `finishReason: 'length'` means the answer was **cut off**. Production code must check it: a truncated JSON is invalid JSON.
- While building this lab, `gemini-3.1-flash-lite` returned **503 "high demand"**. Retries aren't optional with LLM APIs.
- Jitter matters: 1,000 clients retrying after exactly 1s would hit the provider again in lockstep (a thundering herd). The [rate-limit visualization](../../visualizations/rate-limits-and-retries.html) shows it.
