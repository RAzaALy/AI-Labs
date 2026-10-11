# 4. Context windows and statelessness

**Time:** 15 min · **Visualization:** [`context-window.html`](../visualizations/context-window.html) · **Lab:** [`labs/04-context-budget`](../labs/04-context-budget)

## The idea
The **context window** is the maximum number of tokens the model can process in one request: **input + output together** (with a separate cap on max output). Current frontier models offer large windows (Claude 5.x models list 1M input tokens and 128K max output), and small local models often 8K–128K.

**The model is stateless.** Each API call is independent. "Conversation memory" exists only because *your code* re-sends the full message history on every turn.

## Web-engineering analogy
The context window is the **request payload budget**, like a max body size on an HTTP endpoint, except the response also counts against it. The LLM is a **stateless REST endpoint**: no server-side session. A chat is your client resending the whole conversation each time, the way a SPA might keep state client-side and POST all of it on every request.

## Consequences you must design for
- **Cost grows quadratically over a conversation.** Turn *n* re-sends turns 1…n−1, so a 50-turn chat pays for the early messages 50 times. Prompt caching (Phase 2) softens this. Summarization and truncation bound it.
- **You need a budget policy** for what goes in when space is limited: system prompt → tool definitions → retrieved docs → recent turns → older turns. Reserve room for the output.
- **More context is not free quality.** Quality degrades as the window fills ("context rot", "lost in the middle"). Curated small context usually beats a stuffed big one.
- **Overflow handling is your job.** Strategies:

| Strategy | How | Trade-off |
|---|---|---|
| Sliding window | Keep the last k turns | Simple; forgets early facts (e.g. the user's name) |
| Summarize-and-drop | Replace old turns with a running summary | Costs an extra LLM call; summaries lose detail |
| Retrieval memory | Store turns as embeddings, recall relevant ones | More infra; recall can miss |
| Pinning | Always keep certain messages (system, key facts) | Must decide what's pinned |

## ⚠️ Common mistakes (one of the four big ones)
1. **Believing the model remembers previous calls or "learns" from users.** It doesn't. If it's not in this request's payload, it doesn't exist for the model. Weights don't change at inference time.
2. **Not reserving output space.** Prompt + `max_tokens` must fit the window. A full window gets a truncated answer or an error.
3. **Counting only message text.** System prompts, tool schemas, images (hundreds to thousands of tokens each) and reasoning tokens all consume budget.
4. **Stuffing everything "because the window is 1M"**, and paying latency and cost on every request for context that hurts accuracy.

## Senior check
You can explain why chat cost grows super-linearly, design a context-budget policy for a support bot (what's pinned, what's summarized, what's retrieved), and explain "the model is stateless" to a PM in one sentence.
