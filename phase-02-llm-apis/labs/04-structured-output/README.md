# Lab 04: Structured output you can trust (≈60 min)

**Concept:** [theory/04-structured-output.md](../../theory/04-structured-output.md) · **Visualization:** [structured-output.html](../../visualizations/structured-output.html) · **Key:** optional

## Task
In `starter/index.ts`:
1. `TicketSchema` (Zod): enums, nullable fields, bounds, and `.describe()` text. **The schema is part of the prompt.**
2. `extractTicket`: `generateText` + `Output.object`.
3. `classifyChoice`: `Output.choice`, so there's no free-text parsing (compare with Lab 03's `parseLabel`).
4. `extractWithRepair`: catch `NoObjectGeneratedError`, feed the validation error back, retry once.
5. `streamTicket`: `partialOutputStream`, so a UI can fill in the ticket field by field.
6. `extractLineItems`: `Output.array`. The model extracts, and **your code does the arithmetic**.

## Run
```bash
npx tsx phase-02-llm-apis/labs/04-structured-output/check.ts starter
```

## What to notice
- "Never invent ids" in a field description + `nullable()` → the vague email yields `orderId: null`. Without both, models happily fabricate `ORD-00001`.
- Partial objects are **not validated**. Render them, but never act on them (save, charge, email) until the final `output` resolves.
- The repair test is always scripted, because real models rarely fail on cue, yet the repair path is exactly the code that breaks in production at 3 a.m.
