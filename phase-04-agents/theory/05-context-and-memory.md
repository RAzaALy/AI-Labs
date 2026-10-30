# 5. Context and memory for long-running agents

**Time:** 20 min · **Visualization:** [`context-growth.html`](../visualizations/context-growth.html) · **Lab:** [`labs/04-context-management`](../labs/04-context-management)

## The idea
An agent's context is everything sent on each step: instructions, tool definitions, history and tool results. It grows every step, which makes each step **more expensive** and, past a point, **worse** ("context rot": recall drops as context grows, Phase 1). *Context engineering* means keeping the smallest set of high-signal tokens that gets the job done. The standard tools:

| Technique | What it does | Cost |
|---|---|---|
| **Tool-result clearing** | Replace old tool outputs with a short placeholder; keep the calls | Cheap; the model may re-fetch if cleared too early |
| **Compaction / summarisation** | Summarise older history with an LLM call and continue from the summary | One extra call; details lost |
| **Structured notes** | The agent writes key facts to storage outside the context (`saveNote`) and reads them back | Needs the model to actually take notes, so enforce it |
| **Just-in-time retrieval** | Keep ids and references; load details only when needed | More tool calls, much smaller context |
| **Sub-agents** | A worker explores with its own context and returns a condensed result | Extra calls; the parent sees only the summary |

**Memory** across sessions is the same idea made persistent: a store (Postgres rows, files) the agent reads and writes through tools, never "the whole past conversation".

## Web-engineering analogy
**Pagination + a cache + a session store.** You don't send a user's whole history on every request. You send what this page needs, keep the rest server-side, and fetch on demand.

## What Lab 04 measured
Clearing saved **28%** of input tokens on a scripted run. Live, clearing too eagerly made Gemini **re-search until the 12-step cap with no answer**. Counting by steps and **enforcing** note-taking with `prepareStep` (`activeTools: ['saveNote']` after each search) gave 3/3 correct runs.

## ⚠️ Common mistakes
1. **Measuring tokens saved, not task success.** Aggressive compaction can cost more than it saves.
2. **Dropping messages.** A tool call without its result is an invalid history, so replace outputs instead.
3. **Hoping the model takes notes.** Make it a rule with `prepareStep`.
4. **Compacting every step.** Each rewrite invalidates the prompt cache from that point on. Do it rarely, in big chunks.

## Senior check
You can explain why agent cost grows faster than linearly, and choose and tune a context strategy based on success rate and cost.
