# Lab 01: Chunking (≈60 min)

**Concept:** [theory/02-chunking.md](../../theory/02-chunking.md) · **Visualization:** [chunking-playground.html](../../visualizations/chunking-playground.html) · **Needs:** nothing (no key, no database)

## Task
In `starter/index.ts`, working on the real Acme handbook in `corpus/acme-handbook/`:
1. `fixedSizeChunks`: the naive baseline (token windows with overlap).
2. `splitBlocks`: blank-line blocks that never split a fenced code block.
3. `splitSections`: one section per `##` heading, with a heading path.
4. `markdownChunks`: sections → blocks → packed chunks under a token limit, each with an **`embedText` that starts with its heading path** (a contextual header).

## Run
```bash
npx tsx phase-03-rag/labs/01-chunking/check.ts starter
```

## What to notice
- Fixed 40-token windows split code blocks in the deploy guide (2 of 12 chunks had an unbalanced fence). Structure-aware chunking never does.
- `stripHtmlComments` removes `webhooks.md`'s hidden "ignore all previous instructions" line at ingestion. Clean data is a security control.
- The edge-case check exists because the first version of this lab **recursed forever** on a big table at a 100-token limit. Chunkers need a "no progress → fixed window" fallback.
- Labels in the golden set are per *section*, not per chunk, so you can change chunk size without relabelling.
