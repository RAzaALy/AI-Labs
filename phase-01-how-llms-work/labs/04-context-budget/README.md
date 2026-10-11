# Lab 04: Context budgets and statelessness (≈40 min)

**Concept:** [theory/04-context-windows.md](../../theory/04-context-windows.md) · **No API key needed.**

## Task
You're writing the piece of a chat backend that decides **what goes into the next request**. In `starter/index.ts`:
1. `messageTokens` / `totalTokens`: count tokens, including per-message chat-format overhead.
2. `fitToBudget(messages, { contextWindow, reserveForOutput })`: a sliding-window policy that pins the system prompt and the latest message and drops the oldest turns until the input fits. If even the pinned messages exceed the budget, throw an error that says "… the input budget is N".
3. `conversationInputTokens(tokensAddedPerTurn)`: what you actually get billed when every turn resends the history.

## Run
```bash
npx tsx phase-01-how-llms-work/labs/04-context-budget/check.ts starter
```

## What to notice
- A 50-turn chat adding 200 tokens per turn holds 10k tokens of conversation but bills **255k input tokens**. This is the "stateless ⇒ quadratic" effect, and the reason prompt caching (Phase 2) and summarization exist.
- After truncation, the model genuinely cannot know your first question. Nothing is "remembered" outside the payload.

## Stretch (optional, +30 min)
- Add a `summarize` strategy: replace dropped turns with one synthetic `system` message (`"Earlier conversation summary: …"`). For now, stub the summarizer with "first sentence of each dropped message". In Phase 2 you'll swap in an LLM call.
- Make the policy tool-aware: tool-call/tool-result messages must be dropped *as a pair* (APIs reject orphaned tool results).
