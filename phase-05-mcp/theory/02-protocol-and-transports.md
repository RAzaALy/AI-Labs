# 2. The protocol: 2026-07-28, stateless, two transports

**Time:** 25 min · **Visualization:** [`mcp-wire.html`](../visualizations/mcp-wire.html) · **Labs:** [`01`](../labs/01-first-server), [`02`](../labs/02-client-and-agent), [`03`](../labs/03-http-and-auth)

## The idea
MCP messages are **JSON-RPC 2.0**: requests with an `id`, responses with `result` or `error`, and notifications without an `id`. The current revision, **2026-07-28**, made the protocol **stateless**:

- **No handshake.** The 2025 flow (`initialize` → `notifications/initialized`) is gone. Every request carries its protocol version, client info and client capabilities in `_meta` (`io.modelcontextprotocol/protocolVersion`, `.../clientInfo`, `.../clientCapabilities`).
- **`server/discover`**: an optional first call that asks the server which revisions and capabilities it supports. The SDK uses it to choose the era.
- **No sessions.** No `Mcp-Session-Id`. Any server instance can answer any request, so state lives in **your backend** (Postgres here) or in explicit handles you pass as tool arguments.
- **Every result has `resultType`**: `"complete"`, or `"input_required"` when the server needs something from the client first (theory 05).
- **Change notifications** (tools/resources/prompts changed) go over one opt-in stream, `subscriptions/listen`. `ping`, `logging/setLevel` and resumable SSE are gone. Sampling, roots and logging are deprecated.
- **List results carry cache hints** (`ttlMs`, `cacheScope`), and `tools/list` should come back in a **deterministic order**, so hosts can cache it and prompt caches hit.

**Transports:**
| | stdio | Streamable HTTP |
|---|---|---|
| How | the host starts your server as a child process; newline-delimited JSON on stdin/stdout | `POST /mcp`; the response is JSON or an SSE stream |
| Who can call | whoever started the process (the local user) | anyone who can reach the port → **auth required** (theory 04) |
| Headers | n/a | `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, so gateways can route and rate-limit without parsing JSON |
| Typical use | local tools in Claude Code / Desktop / IDEs | shared or remote servers, multi-user |

**Measured (mcp-wire.html, real SDK traffic):** listing tools and making two calls took **4 HTTP requests** on 2026-07-28 and **6** on 2025-11-25 (handshake, plus a GET stream that the stateless server refuses with 405). The 2026 exchange is **larger**, though: 5.0 KB vs 4.0 KB of JSON, because every request repeats its `_meta` envelope. That's the price of statelessness.

## Web-engineering analogy
2025-11-25 was a **sticky session** (log in, get a session id, stay on one backend). 2026-07-28 is a **stateless REST API**: every request self-describing, any replica can serve it, horizontal scaling and load balancers just work.

## Two eras, one codebase
Servers and clients from both eras are out there. The v2 TypeScript SDK serves both from one factory: `serveStdio(factory)` and `createMcpHandler(factory)` answer 2025 clients and 2026 clients alike (Lab 01 checks both). Two gotchas measured while building this phase:
1. **The client defaults to the old protocol.** `new Client(...)` without `versionNegotiation: { mode: 'auto' }` runs the 2025 handshake.
2. **`auto` over stdio starts your server twice.** The SDK probes with `server/discover` on a short-lived extra copy of your process, then starts the real one. Our "rug pull" fixture, which counted launches, counted wrong. **Never do side effects at startup** (seeding, migrations, counters), since two copies race.

## ⚠️ Common mistakes
1. **`console.log` in a stdio server.** stdout *is* the protocol. In Lab 01 the SDK client quietly skipped the stray line, but other hosts may not, and a logged object that happens to be valid JSON corrupts the stream. Log to **stderr**.
2. **Keeping per-client state in server memory.** With no sessions, the next request may hit another instance. Put state in a database, or return a handle the client passes back.
3. **Treating `isError: true` as a protocol failure.** A failed tool is a **successful** JSON-RPC response whose content the model should read. Protocol errors (`error.code`) are for broken requests: unknown method, invalid params, bad `requestState`.

## Senior check
You can explain why the 2026 revision dropped sessions (horizontal scaling, gateways), what replaced the handshake, and why a stdio server must never write to stdout.
