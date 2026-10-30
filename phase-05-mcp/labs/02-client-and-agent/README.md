# Lab 02: Clients, adapters and an agent on two servers (≈60 min)

**Concepts:** [01](../../theory/01-what-mcp-is.md), [02 protocol](../../theory/02-protocol-and-transports.md) · **Visualization:** [servers-and-trifecta.html](../../visualizations/servers-and-trifecta.html) · **Servers:** [`env/servers/acme.ts`](../../env/servers/acme.ts) (Phase 4's ops tools over MCP), [`env/servers/status.ts`](../../env/servers/status.ts) (the public status page)

Now you're the **host**. Start two servers as child processes, turn their tools into AI SDK tools, and run a Phase 4-style agent on them.

## Task
1. `connectStdio(name, command, args)`: a `Client` with `versionNegotiation: { mode: 'auto' }` over `StdioClientTransport`.
2. `toAiSdkTools(conn)`: for each MCP tool a `dynamicTool` with `jsonSchema(t.inputSchema)`. Names prefixed `server__tool`. `isError` → **throw**, so the model gets a tool *error*. Otherwise return `structuredContent` (or the text).
3. `mergeToolSets(...)`: refuse collisions loudly.
4. `definitionTokens(conn)`: what the server's tool definitions cost on every request.
5. `aiSdkMcpTools(...)`: the same with `@ai-sdk/mcp`'s `createMCPClient` in one call.

## Run
```bash
LLM_PROVIDER=mock npx tsx phase-05-mcp/labs/02-client-and-agent/check.ts starter
npx tsx phase-05-mcp/labs/02-client-and-agent/check.ts starter      # + a live agent run (Gemini, ~15 s)
```

## Measured when this lab was built (2026-10-31, `gemini-3.5-flash-lite`)
```
tool definitions: acme 510 tokens · status 113 tokens · both 623 tokens, re-sent at every agent step
live:  status__getDeployStatus(api) → status__listIncidents → acme__getDeployStatus(api)
     → acme__searchHandbook("API errors deploy rollback incident post-incident review") → acme__rollback(api)
     → acme__createTicket({..., customerId: "C-000"})   ✗ No customer C-000…
     → acme__createTicket({...})                         ✓
     5 steps · 7,479 input tokens · the world in the OTHER process: api healthy
```

## What to notice
- **Errors cross the process boundary as data.** The model invented `customerId: "C-000"`, the server answered "No customer C-000…", and the model retried without it in the next step.
- **Same name, different meaning.** Both servers have `getDeployStatus`: internal version vs. what customers see. Without prefixes, a plain object merge silently keeps only the last one, and the model can't reach the other.
- **Grade the server, not the transcript.** The check calls `getDeployStatus` again *through the protocol*: the world lives in the child process.
- **`@ai-sdk/mcp` is one line, with one difference.** It hands a tool result with `isError: true` to the model as ordinary content, not as a tool error. The model can still read "is healthy … Roll back only a degraded service", but nothing marks it as a failure. Your adapter throws, so the AI SDK reports `error-text`. Know what your adapter does.
- **Close every client.** Each one owns a child process. A forgotten one keeps your CLI alive (Phase 4's "hang at the end" bug, again).
