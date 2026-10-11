# 1. Anatomy of an LLM API call

**Time:** 25 min · **Visualization:** [`api-request-anatomy.html`](../visualizations/api-request-anatomy.html) · **Lab:** [`labs/01-raw-http`](../labs/01-raw-http)

## The idea
Every LLM API is an HTTPS POST: **instructions + a list of messages + generation settings in, text (or tool calls) + usage + a finish reason out.** Providers differ only in field names and a few semantics. The AI SDK normalizes them, but you need the raw shape for debugging, logging and cost.

| Concept | Anthropic Messages | OpenAI-compatible (Chat Completions) | Gemini `generateContent` | AI SDK 7 |
|---|---|---|---|---|
| System prompt | top-level `system` | first message `role: "system"` | `systemInstruction` | `instructions` |
| Assistant role | `assistant` | `assistant` | `model` | `assistant` |
| Output cap | `max_tokens` (required) | `max_tokens` / `max_completion_tokens` | `generationConfig.maxOutputTokens` | `maxOutputTokens` |
| Usage | `usage.input_tokens/output_tokens` | `usage.prompt_tokens/completion_tokens` | `usageMetadata.promptTokenCount/candidatesTokenCount/thoughtsTokenCount` | `usage.inputTokens/outputTokens` + details |
| Truncated | `stop_reason: "max_tokens"` | `finish_reason: "length"` | `finishReason: "MAX_TOKENS"` | `finishReason: "length"` |
| Wants a tool | `stop_reason: "tool_use"` | `finish_reason: "tool_calls"` | a `functionCall` part | `finishReason: "tool-calls"` |

"OpenAI-compatible" has become the de facto standard: Groq, OpenRouter, Ollama, vLLM and even Gemini (`/v1beta/openai/`) accept it.

## Web-engineering analogy
An LLM call is a **stateless RPC with a metered payload**. The request body is your whole session state (Phase 1). The `usage` block is the **invoice line** for that request, so log it like you'd log status codes. `finish_reason` is the **response status you must check**: `length` is the LLM equivalent of a truncated HTTP body.

## Errors you'll actually see
| Status | Meaning | Retry? |
|---|---|---|
| 400 | Bad request: invalid schema, context too long, unsupported parameter | **No**, fix the request |
| 401 / 403 | Bad or missing key, no access to the model | No |
| 404 | Model id doesn't exist **or was retired** (`gemini-2.5-flash-lite` returned 404 "no longer available to new users" in our probe) | No, so pin models in config, not code |
| 408 / 5xx | Timeout or provider error | Yes, with backoff |
| 429 | Rate limit (RPM / TPM / RPD) or quota exhausted | Yes, honour `Retry-After` |
| 503 / 529 | Overloaded ("high demand"; `gemini-3.1-flash-lite` did this during the build) | Yes, and consider a **fallback model** |

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Raw HTTP / provider SDK | Full control, newest features first | Lock-in; you rewrite per provider |
| Provider-agnostic SDK (AI SDK) | Swap models via config; streaming/tools/structure normalized | Abstraction lag on brand-new features; one more dependency |
| OpenAI-compatible endpoint for everything | One client for many providers | Lowest common denominator; provider extras (caching hints, thinking control) can be missing |

## ⚠️ Common mistakes
1. **Ignoring `finish_reason`.** A `length`-truncated answer looks normal until it's half a JSON object or a sentence cut mid-word.
2. **Putting the API key in the URL** (`?key=…`). URLs are logged by proxies, CDNs and browsers. Use headers. Never ship keys to a browser at all: call the LLM from your server.
3. **Retrying 4xx** errors (burns quota and hides bugs) or **not retrying 429/5xx** (flaky product).
4. **Hardcoding model ids in business logic.** Models get retired on fixed dates, so treat the id as config.
5. **Not logging `usage` per request.** You'll have no way to explain the bill or find the expensive feature.

## Senior check
You can sketch the request/response of two providers from memory, explain which errors to retry, and say why the model id belongs in config with an upgrade plan.
