# Lab 01: Your first MCP server (≈60 min)

**Concepts:** [01 what MCP is](../../theory/01-what-mcp-is.md), [03 building servers](../../theory/03-building-servers.md) · **Visualization:** [mcp-wire.html](../../visualizations/mcp-wire.html) · **No key, no database needed**

An MCP server for the Acme handbook with all three primitives: a **tool** (`searchHandbook`), **resources** (`handbook://{slug}`, one per current document) and a **prompt** (`answerWithCitations`). Search is Phase 4's in-memory BM25; the project swaps in Phase 3's hybrid search.

## Task
1. `safely(tool, fn)`: success → text + `structuredContent`; `ToolError` → `isError` with its message; anything else → `isError` with a **generic message and a reference id**, details to stderr.
2. Register `searchHandbook` with an input schema (min length, `limit` 1–5, default 3), an **output schema**, and honest annotations (`readOnlyHint`, `idempotentHint`, `openWorldHint: false`).
3. Register the `handbook://{slug}` resource template: `list` current documents only, `complete` slugs, read the markdown, `ResourceNotFoundError` for anything else (including the deprecated 2024 policy).
4. Register the `answerWithCitations` prompt: the top two sections as embedded resources, then the instruction and question.
5. `server.ts`: serve it over stdio with `serveStdio`. The starter has a `console.log` in it; the check will tell you why that's a bug.

## Run
```bash
npx tsx phase-05-mcp/labs/01-first-server/check.ts starter
npx mcp-inspector --cli npx tsx phase-05-mcp/labs/01-first-server/starter/server.ts --method tools/list   # poke it yourself
npx mcp-inspector npx tsx phase-05-mcp/labs/01-first-server/starter/server.ts                             # the Inspector web UI
```

## Measured when this lab was built (2026-10-31)
```
✅ a real client connects over stdio and negotiates the 2026-07-28 protocol
✅ stdout carries only JSON-RPC: logs go to stderr
   top hit: billing-and-refunds.md › Refund policy (handbook://billing-and-refunds)
   empty result: "No handbook section matched "zebra quokka xylophone". Try other keywords, or read a document from the handbook:// resources."
   client saw: "Internal error in searchHandbook (ref 0ix6jrk0). Not caused by your input; do not retry."
   10 documents, e.g. handbook://api-errors, handbook://billing-and-refunds, handbook://data-retention-and-backups
   messages: resource, resource, text
✅ older (2025-11-25) clients still work
✅ the MCP Inspector (CLI) lists your tools, resources and prompts         → 9 passed in 5.8 s
```

## What to notice
- **stdout is the protocol.** With the `console.log` line in place, the SDK client *silently skipped* the junk line, so the tool calls still passed. Only the raw stdout check caught it. Other hosts aren't that forgiving, and a logged object that happens to be valid JSON breaks framing. Use `console.error`.
- **The SDK forwards thrown error messages verbatim.** Without `safely`, the injected failure sends `ECONNREFUSED db.internal.acme:5432 (user=svc_handbook password=hunter2)` to the client.
- **Validation is free.** `query: "a"` never reaches your handler: the input schema rejects it and the model gets an `isError` result explaining why.
- **One factory, two eras.** `serveStdio(factory)` answers the 2026-07-28 client (`server/discover`, `_meta` envelope) and a 2025 client (`initialize` handshake) without a line of era-specific code.
