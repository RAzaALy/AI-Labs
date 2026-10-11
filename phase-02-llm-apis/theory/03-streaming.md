# 3. Streaming

**Time:** 20 min · **Visualization:** [`streaming-sse.html`](../visualizations/streaming-sse.html) · **Lab:** [`labs/02-streaming-sse`](../labs/02-streaming-sse)

## The idea
Generation is sequential (Phase 1: decode is one token at a time), so a full answer takes seconds. **Streaming** sends tokens as they're produced over **Server-Sent Events (SSE)**: an HTTP response with `content-type: text/event-stream` and `data: …` lines separated by blank lines. Perceived latency drops from *total time* to *time to first token* (TTFT).

Measured in Lab 02 on Gemini's free tier: **TTFT ≈ 1,000 ms, then ≈ 200 tokens/s**. A 300-token answer feels like 1 s with streaming and 2.5 s without.

### The pipeline in a web app
`Provider SSE → your server (parse, meter, guard) → your own stream to the browser → UI renders deltas`

Never stream directly from browser to provider: the key would be exposed, and you couldn't meter, log, filter or abort server-side. The AI SDK's UI message stream (Phase 2 project) is a typed SSE protocol between your server and `useChat`.

## Web-engineering analogy
It's **chunked transfer / progressive rendering**, like streaming SSR in Next.js. TTFT is **TTFB**. The "Stop" button is an **`AbortController`** that cancels the fetch, which closes the upstream connection so the provider stops generating (and stops billing).

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Stream | Fast perceived latency, cancellable | Harder error handling (errors arrive mid-stream with a 200 status); can't validate the whole answer before showing it |
| Don't stream | Validate/guard the full output first; simpler | User stares at a spinner; long requests hit proxy timeouts |
| Stream structured output | Responsive forms/cards | Partial objects are **unvalidated**; never act on them |

## Things that bite in production
- **Proxies buffer SSE** (nginx `proxy_buffering`, some CDNs, compression middleware), so tokens arrive all at once at the end. Disable buffering for the route.
- **Errors after the 200:** the status code is already sent. Errors must be in-band events, and the UI must render a "failed mid-answer" state.
- **Timeouts:** serverless platforms cap request duration. Long generations need a streaming-capable runtime or a background job (Phase 7).
- **Usage arrives at the end.** OpenAI-compatible APIs only send it if you request `stream_options.include_usage`. Gemini sends it cumulatively in every chunk (sum them and you overcount).

## ⚠️ Common mistakes
1. **Parsing SSE by splitting each network chunk on `\n`.** Chunks split lines and multi-byte characters. Buffer, and decode with `TextDecoder({ stream: true })` (Lab 02's 1-byte test).
2. **No cancellation path.** The user closes the tab, the server keeps generating, and you pay for tokens nobody reads. Propagate the abort signal upstream.
3. **Acting on partial output**, e.g. saving a half-streamed JSON object or running a half-received tool call.
4. **Measuring only total latency.** Track TTFT and tokens/s separately: they have different causes (prompt length/queueing vs output length/model size).

## Senior check
You can explain SSE framing, where TTFT comes from, why aborts must propagate to the provider, and three infrastructure settings that break streaming.
