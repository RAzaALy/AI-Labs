# Lab 04: Context management (≈60 min)

**Concept:** [theory/05-context-and-memory.md](../../theory/05-context-and-memory.md) · **Visualization:** [context-growth.html](../../visualizations/context-growth.html)

## Task
1. `clearOldToolResults(messages, keepLast)`: replace tool **results** older than the last `keepLast` **steps** with a short placeholder. Keep every tool **call**, never drop messages, never clear notes, and don't mutate the input.
2. `notesTools(store)`: `saveNote` / `readNotes`, memory that lives outside the context window.
3. `compactingPrepareStep(budget, keepLast)`: a `prepareStep` that clears old results once the history exceeds `budget` tokens.
4. `notesAfterSearch()`: a `prepareStep` that, after any search step, allows **only** `saveNote` (`activeTools` + `toolChoice: 'required'`). `combinePrepareSteps(...)` merges several.

## Run
```bash
npx tsx phase-04-agents/labs/04-context-management/check.ts starter
LLM_PROVIDER=mock npx tsx phase-04-agents/labs/04-context-management/check.ts starter
```

## What happened when this lab was built (the interesting part)
- Scripted research run: compaction cut billed input tokens by **28%** (6,239 → 4,503), and all 3 notes still reached the final step.
- **First live version: compaction sometimes made the agent worse.** One run passed in 6 steps. In the next, Gemini ran 3 searches in parallel in one step, and `keepLast` (which counted individual results) cleared 2 of them before the model had saved anything. So it searched again and again, hit the 12-step cap with no answer, and context grew to ~4,100 tokens anyway.
- Fix 1: count `keepLast` in **steps**, not results. That's better, but runs still varied: 1 pass in 6 steps and 1 failure in 12, on identical input.
- Fix 2: **enforce the behaviour in code**. After a search step, `notesAfterSearch` allows only `saveNote`. Then **3/3 live runs** answered correctly (30 days · 2% · 5 minutes) in 4, 4 and 10 steps.

## What to notice
- Compaction is a trade-off, not free savings: clear too early and the agent re-fetches, paying more than it saved. **Measure task success, not just tokens.**
- If you depend on a behaviour ("save notes before moving on"), put it in `prepareStep` (`activeTools`, `toolChoice`) rather than the prompt.
- Rewriting history also invalidates the provider's prompt cache from the first changed message. Clear in big, infrequent batches, not a little every step.
