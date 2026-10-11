# Lab 02: Streaming with Server-Sent Events, by hand (≈60 min)

**Concept:** [theory/03-streaming.md](../../theory/03-streaming.md) · **Visualization:** [streaming-sse.html](../../visualizations/streaming-sse.html) · **Key:** optional (local fake server; one live check with Gemini)

## Task
In `starter/index.ts`:
1. `parseSSE(body)`: turn a byte stream into SSE event payloads. The check feeds it **1-byte chunks**, which split lines *and* UTF-8 characters (Urdu, emoji).
2. `streamGemini(...)`: `streamGenerateContent?alt=sse`, built on the provided `consume()`, which measures **TTFT** and **tokens/s**.
3. `streamOpenAICompatible(...)`: `stream: true`, the `[DONE]` sentinel, and `stream_options.include_usage` (or you get no token counts when streaming).
4. The abort test passes once your stream honours an `AbortSignal`, which is the "Stop" button in every chat UI.

## Run
```bash
npx tsx phase-02-llm-apis/labs/02-streaming-sse/check.ts starter
```

## What to notice (live run while building this lab)
- Real Gemini: **TTFT ≈ 1,000 ms**, then **≈ 200 tokens/s**. For a short answer, waiting for the first token is most of the latency, and streaming hides the rest.
- Gemini's `usageMetadata` is **cumulative** per chunk. Summing chunks overcounts. Other providers send usage once at the end.
- An aborted stream still cost you every token generated up to the abort, plus any the server produced before it noticed the disconnect.
