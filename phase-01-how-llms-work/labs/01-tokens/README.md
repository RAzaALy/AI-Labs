# Lab 01: Tokens and cost (≈45 min)

**Concept:** [theory/01-tokens.md](../../theory/01-tokens.md) · **No API key needed.**

## Task
In `starter/index.ts`, implement:
1. `countTokens(text)` returns counts for two real tokenizers: GPT-2 (50k vocab, via transformers.js) and `o200k_base` (200k vocab, GPT-4o/GPT-5 family, via `js-tiktoken`).
2. `tokenPieces(text, 'o200k' | 'gpt2')` returns the visible string pieces, e.g. `["st","raw","berry"]`.
3. `charsPerToken(text, tokenizer)`: the compression ratio.
4. `estimateCost(model, inputTokens, outputTokens)` using `shared/pricing.ts`, plus `monthlyCost()` for a traffic profile.

## Run
```bash
npx tsx phase-01-how-llms-work/labs/01-tokens/check.ts starter
```
Compare with the reference solution:
```bash
npx tsx phase-01-how-llms-work/labs/01-tokens/check.ts solution
```
The first run downloads the GPT-2 tokenizer (~2 MB) into `.cache/models`.

## What to notice
- Urdu text of the *same length* costs ~2× (o200k) to ~6× (GPT-2) more tokens than English. Vocabulary size matters for non-English text.
- A UUID-heavy JSON blob is ~1.7 chars/token. Budgeting by `length / 4` underestimates it badly.
- `"strawberry"` is 3 tokens in o200k and 1 token (`" strawberry"`, with its leading space) in GPT-2. The model never sees letters.
- Model choice is a ~20× cost lever for the same traffic.
