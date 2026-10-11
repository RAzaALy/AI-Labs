# 1. Tokens and tokenization

**Time:** 20 min reading · **Visualization:** [`tokenizer-playground.html`](../visualizations/tokenizer-playground.html) · **Lab:** [`labs/01-tokens`](../labs/01-tokens)

## The idea
An LLM never sees characters or words. A **tokenizer** converts text into a sequence of integer IDs from a fixed vocabulary (typically 50k–260k entries). Modern tokenizers use **byte-level BPE** (byte-pair encoding): start from raw bytes and repeatedly merge the most frequent adjacent pair seen in training data. Frequent strings (`" the"`, `"ing"`, `"function"`) become single tokens, and rare strings get split into many small pieces.

Everything you pay for and every limit you hit is counted in tokens: context window, max output, rate limits (TPM), and price per million tokens.

## Web-engineering analogy
Tokenization is **a compression codec with a fixed dictionary**, like gzip with a frozen dictionary trained on mostly English web text and code. Text that looks like the training data compresses well (≈4 chars/token for English prose). Text that doesn't (Urdu, Thai, base64, minified JSON, UUIDs) compresses badly, and you pay per compressed byte.

Token IDs work like **foreign keys into a lookup table**. ID `15496` means nothing until the model looks up row 15496 in its embedding table (see [02-embeddings](02-embeddings.md)).

## How BPE works (the 30-second version)
1. Start with every byte as its own token (256 base tokens), so *any* input is representable and there is never an "unknown word".
2. Count adjacent pairs in a big corpus and merge the most frequent pair into a new token.
3. Repeat N times. N controls vocab size.
4. To encode new text, apply the learned merges in order.

The playground lets you train a tiny BPE on your own corpus and step through the merges.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Bigger vocab (e.g. 200k, `o200k_base`) | Fewer tokens per text, cheaper/faster, better for multilingual | Bigger embedding table, rare tokens undertrained |
| Smaller vocab (e.g. 50k, GPT-2) | Smaller model, every token well trained | Longer sequences, which means more compute and cost |
| Byte-level fallback | Never fails on any input | Unusual scripts can cost 3–10× more tokens than English |

## Facts you must know
- **Tokenizers are model-family specific.** GPT-4o/GPT-5-family models use `o200k_base`. Claude, Gemini and Llama each use their own. Anthropic notes that its current tokenizer (introduced with Claude Opus 4.7) fits ~555k words in 1M tokens, versus ~750k on older models. **The same text has a different token count on every provider.**
- **The leading space is part of the token.** `"Hello world"` → `["Hello", " world"]`. `" world"` and `"world"` are different IDs.
- **Output tokens cost more than input tokens**, typically 4–5×. Generation is sequential and therefore slow and expensive. Reading input is parallel.
- **Accurate counts come from the provider**, via Anthropic's `count_tokens` endpoint or the `usage` field returned on every response. A local tokenizer (`js-tiktoken`) is exact only for the model family it was built for.

## ⚠️ Common mistakes
1. **Estimating cost with `text.length / 4` for non-English or structured data.** In the lab you'll see that Urdu, JSON and code can blow this up badly. Budget with real counts.
2. **Asking the model to do character-level work** (count letters, reverse a string, enforce an exact character limit). The model sees `"strawberry"` as perhaps 2–3 tokens, not 10 letters. Do character work in code.
3. **Assuming one tokenizer for all providers** when computing context budgets in a multi-provider app. Keep a 10–15% safety margin, or count per provider.
4. **Ignoring hidden tokens.** Chat formatting, system prompts, tool schemas and reasoning ("thinking") tokens all count. Tool definitions alone can be thousands of tokens per request.

## Senior check
You can explain why a prompt in Urdu costs more than the same prompt in English, why the model struggles to count letters, and why you must never reuse one provider's token count for another provider's billing.
