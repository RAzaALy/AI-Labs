# 3. Building a good server: schemas, results, errors

**Time:** 20 min · **Lab:** [`labs/01-first-server`](../labs/01-first-server)

## The idea
Everything from Phase 4's [tool design](../../phase-04-agents/theory/04-tool-design.md) still holds: task-shaped tools, bounded outputs, actionable errors, deterministic work in code. MCP adds a few things you now control *as a server author*:

**Input and output schemas.** `inputSchema` (zod → JSON Schema 2020-12) is validated **before** your handler runs. A bad argument comes back as `isError: true` with the validation message, and your code never sees it. `outputSchema` declares the shape of `structuredContent`, and the SDK checks your result against it **before it leaves the server**. Return both:
```ts
return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
```
Text for older clients and for the model; structure for code (validation, UIs, Lab 02's adapter).

**Annotations are hints, not security.** `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` help hosts decide what to show or auto-approve. A malicious server can lie in them, so a host should never treat them as a guarantee, and your *server* must enforce its rules in code regardless.

**Three kinds of failure:**
| What happened | What the client gets | Who reads it |
|---|---|---|
| Policy / user error (`ToolError`: "invoice is 42 days old…") | `isError: true` + your message | **the model**, which recovers |
| Bad request (unknown tool, unknown resource, invalid `requestState`) | JSON-RPC `error` (`-32602`, …) | the client code |
| Your bug or an outage | `isError: true` + **a generic message and a reference id**; details to stderr | the user (via the model) and your logs |

**Measured:** by default the SDK puts a thrown error's `message` into the result **verbatim**. A spike tool that threw `kaboom secret=xyz` sent exactly that to the client, and Lab 01's check catches `password=hunter2` leaking the same way. Wrap every handler (Lab 01's `safely`, the project's `run`).

**Resources** are addressed by URI. Static (`ops://deploys`) or templated (`handbook://{slug}`), with `list` (what exists) and `complete` (autocomplete for the user). Unknown URI → `ResourceNotFoundError`. Since 2026-07-28 that's `-32602`, not the old `-32002`. Serve only what should be served: Phase 3's deprecated refund policy is excluded from the list *and* from reads.

**Prompts** are user-picked templates. They can embed resources, so `answerWithCitations` attaches the two best handbook sections as `resource` content before the question.

## Web-engineering analogy
Input schema = request validation middleware. `structuredContent` + `outputSchema` = a typed API response (think OpenAPI). The error table is the difference between a 4xx with a helpful body, a 400 from the framework, and a 500 that shows a request id instead of a stack trace.

## Trade-offs
| Rich structured outputs | Plain text |
|---|---|
| Hosts and code can use the data; validated | Every host can show it |
| Schema is part of your contract: changing it can break clients | Easy to change, impossible to rely on |

Return both: the cost is a few bytes.

## ⚠️ Common mistakes
1. **Leaking internals in errors** (connection strings, SQL, file paths). The SDK won't stop you.
2. **Huge results.** A tool returning a 40 KB document blows the host's context. Return excerpts and a **resource URI** (`uri: 'handbook://billing-and-refunds'`) the host can fetch if needed.
3. **Non-deterministic `tools/list` order or descriptions with timestamps.** They break host caching and the model provider's prompt cache. Register tools in a fixed order with stable text.
4. **Relying on annotations for safety.** `destructiveHint: true` informs. It doesn't protect anything.

## Senior check
You can design one tool, one resource template and one prompt for a domain you know, and explain which errors reach the model, which reach client code, and which must never leave the server.
