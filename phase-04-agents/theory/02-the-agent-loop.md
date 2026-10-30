# 2. The agent loop: steps, stop conditions, cost

**Time:** 20 min · **Visualization:** [`agent-loop.html`](../visualizations/agent-loop.html) · **Lab:** [`labs/01-tool-loop-agent`](../labs/01-tool-loop-agent)

## The idea
Each **step** is one model call. The model returns text and/or tool calls, your runtime executes the tools, appends the results to the history, and calls the model again. In AI SDK 7, `ToolLoopAgent` (or `generateText` with `stopWhen`) runs this loop:

```ts
new ToolLoopAgent({ model, instructions, tools, stopWhen: [hasToolCall('done'), isStepCount(10), tokenBudget(60_000)] })
```

- **Stop conditions** are checked after each step that produced tool calls: `isStepCount(n)`, `hasToolCall('done')`, or any function of the steps so far (your own token budget). The loop also stops when the model answers without calling a tool.
- **`prepareStep`** runs *before* each step and can change the model, `activeTools`, `toolChoice`, instructions or messages for that step. It's the place for per-step policy (Lab 04).
- **Errors are data.** A thrown tool error becomes a `tool-error` result the model reads on the next step. Good error text is how agents recover.

**Cost grows faster than steps.** Step *n* re-sends the instructions, the tool definitions and every earlier message and result. Lab 01's live run billed 875 → 1,905 input tokens per step, 8.5k tokens for 6 steps.

## Web-engineering analogy
A **while loop around an RPC**, with the RPC deciding whether to continue. You'd never ship `while (true)` around a remote call without a max-iterations guard, a deadline and a circuit breaker.

## Trade-offs
| Knob | Lower | Higher |
|---|---|---|
| Step cap | Cheap, may stop before done | Finishes more tasks, larger worst-case bill |
| Tools offered | Smaller definitions, fewer wrong choices | More capability, more tokens per step |
| Model tier | Cheaper per step, more steps/mistakes | Fewer steps, higher per-step price |

## ⚠️ Common mistakes
1. **Only a step cap.** 10 steps × 20k tokens is still a lot. Add a token or cost budget.
2. **Throwing tool errors out of the loop.** Return them to the model so it can fix its call.
3. **Not knowing *why* a run stopped.** Record `done` vs `max-steps` vs `budget` vs `answered`. They mean very different things in a dashboard.
4. **Logging only the final answer.** Store the trace (calls, inputs, errors, tokens per step), because that's what you debug with.

## Senior check
You can draw the loop, name four stop conditions and why each exists, and estimate the token cost of an N-step run.
