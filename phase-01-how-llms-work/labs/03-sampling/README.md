# Lab 03: Sampling and the generation loop (≈60 min)

**Concept:** [theory/05-sampling.md](../../theory/05-sampling.md) · **No API key needed.** Runs SmolLM2-135M-Instruct in fp32 (~540 MB one-time download, ~0.1 s/token on a laptop CPU).

## Task
**Part 1, pure math** (no model): implement `softmax(logits, T)`, `argmax`, `topK`, `topP` and `sampleIndex` in `starter/index.ts`. These ~40 lines are everything that "temperature" and "top_p" mean on every LLM API.

**Part 2, drive a real LLM:** using the provided `nextTokenLogits(ids)` (one forward pass), implement:
- `topCandidates(prompt, n, T)`: the model's top next-token guesses with probabilities.
- `generate(prompt, opts)`: the **autoregressive loop**: predict → sample → append → repeat.
- `renderChat(messages)`: show the raw string a "chat" turns into.

## Run
```bash
npx tsx phase-01-how-llms-work/labs/03-sampling/check.ts starter
```

## What to notice
- `"The capital of France is"` → `" Paris"` at ~47%, and ~87% at T=0.3. Temperature reshapes the distribution, it doesn't add knowledge.
- Greedy (T=0) ignores the seed. At T=1.3 every seed gives a different continuation, and some are nonsense. Adding `topP: 0.5` trims the nonsense tail.
- The generation loop has **no memory between calls**. Each step re-feeds the whole token sequence. Production servers add a **KV cache** to avoid recomputing the prefix.
- `renderChat` shows that `messages: [{role, content}]` becomes a single string with special tokens like `<|im_start|>`, and that this model injects a *default system prompt*. Chat APIs are a formatting layer over next-token prediction.
