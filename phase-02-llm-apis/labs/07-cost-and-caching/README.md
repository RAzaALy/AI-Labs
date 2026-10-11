# Lab 07: Cost, hidden tokens and caching (≈45 min)

**Concept:** [theory/07-cost-caching-and-limits.md](../../theory/07-cost-caching-and-limits.md) · **Visualization:** [cost-calculator.html](../../visualizations/cost-calculator.html) · **Key:** optional (the math is offline; two observations are live)

## Task
In `starter/index.ts`:
1. `CostMeter`: record usage per call and price **cached input** and **reasoning output** correctly. Totals, a per-model breakdown, and a **pre-flight budget guard** (`assertCanAfford`).
2. `diagnoseUsage`: flag truncation, the **empty-answer trap**, reasoning-heavy calls and cache hits.
3. `compareReasoning` (live): one question at three reasoning settings.
4. `cacheProbe` (live): repeated calls with a long shared prefix. Watch the implicit cache.

## Run
```bash
npx tsx phase-02-llm-apis/labs/07-cost-and-caching/check.ts starter
```

## What happened when this lab was built (real numbers, gemini-3.8-flash)
| Setting | Output tokens | of which reasoning | Cost | Result |
|---|---|---|---|---|
| default, `maxOutputTokens: 60` | 56 | 53 | $0.000218 | **truncated**: "Databases use" |
| `reasoning: 'low'`, max 60 | 27 | 0 | $0.000109 | full one-sentence answer |
| default, max 1000 | 330 | **304** | $0.001246 | same answer, **11× the cost** |

- ⚠️ `maxOutputTokens` caps **thinking + answer together**. On a reasoning model a small cap can return an **empty string** with `finishReason: 'length'`. While building this lab, `gemini-3.8-flash` returned empty answers 2 times out of 3 at `maxOutputTokens: 60`.
- Implicit caching saved ~30% on calls 2 and 3, but it's **best-effort**: in an earlier run the 3rd call got no cache hit. If you need guaranteed savings, use explicit caching (Anthropic `cache_control`, Gemini `cachedContents`).
- Put stable content (instructions, documents, tool schemas) **first** and the variable part **last**. Caches match on prefixes.
