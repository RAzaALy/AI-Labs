# Phase 5: MCP (Model Context Protocol)

**Level:** Intermediate · **Time budget:** ~11 h (2 days at 5–6 h/day, or week 8 of the 12-week plan) · **Keys:** optional. Labs 01, 03 and 04 need no model at all; Labs 02 and 05 and the project run offline on scripted models, and live with a free **Gemini** key. · **Needs:** Docker Postgres for the project (`npm run db:up`), and the `claude` CLI if you want Claude Code as a real host.

Phase 4's tools lived inside one app. MCP puts them behind a **protocol**, so any AI host can use them: Claude Code, IDEs, the Inspector, your own agent. You'll build servers (stdio and HTTP), clients and an agent host. Then you'll secure both directions: your server against hostile clients (auth, scopes, signed approvals), and your host against hostile servers (tool poisoning, rug pulls, the lethal trifecta). Everything targets the current spec, **2026-07-28** (stateless, no handshake), with the v2 TypeScript SDK (`@modelcontextprotocol/server` / `client` 2.4).

## Learning objectives
By the end you can:
1. Explain host / client / server and choose **tools vs resources vs prompts** by who controls them, and say when an MCP server isn't worth its boundary.
2. Build an MCP server over **stdio** with schemas, structured results, honest annotations and errors that never leak internals, and test it with the **Inspector** and a real client.
3. Read the **2026-07-28 wire protocol**: `server/discover`, the per-request `_meta` envelope, `resultType`, no sessions. Keep servers working for 2025 clients too.
4. Write a **host**: connect clients, adapt tools for the AI SDK, namespace them across servers, count their context cost, close what you open.
5. Serve MCP over **Streamable HTTP** safely: loopback, Host/Origin checks, bearer tokens with audience, RFC 9728 metadata, per-tool **scopes**, rate limits, audit actors.
6. Ask a person mid-call with **`input_required`**, and defend round 2: signed state bound to arguments and caller, policy before people, idempotent retries.
7. Threat-model a session of several servers: **tool poisoning, rug pulls, collisions, the lethal trifecta**, and defend with scanning, pinning and least connection.

## Prerequisites
- Phase 4 (agents, tool design, approvals, idempotency). Its `env/` world and its project's `OpsStore` are reused here.
- Phase 3's handbook index for the project: `npm run db:up`, then `npm run ingest` in `phase-03-rag/project/reference`.

## 📺 Watch / read this first (in order, ~75 min)
1. **MCP docs: [Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)** · 20 min. Hosts, clients, servers, primitives, and a full 2026-07-28 exchange (discover → list → call → notifications).
2. **MCP spec: [Key changes in 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)** · 10 min. Stateless, no `initialize`, `server/discover`, input-required, deprecations. Most tutorials online still show the 2025 flow; this tells you what changed.
3. **MCP spec: [Multi round-trip requests](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)** · 10 min. How a server asks the user for input without sessions, and why `requestState` is attacker-controlled. Read before Lab 04.
4. **Simon Willison: [Model Context Protocol has prompt injection security problems](https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/)** · 8 min. Tool poisoning, rug pulls and shadowing in plain words. Read before Lab 05.
5. **MCP spec: [Security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)** · 25 min. Read *Token passthrough*, *State handle hijacking*, *Local MCP server compromise* and *Scope minimization*; skim the rest.

*(Optional, 20 min)* **[Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)**: the full OAuth flow (Protected Resource Metadata, resource indicators, step-up scopes). Lab 03 implements the resource-server half.

## Work plan
| # | Item | Type | Time |
|---|---|---|---|
| 1 | [What MCP is](theory/01-what-mcp-is.md) + [The protocol](theory/02-protocol-and-transports.md) + [wire viz](visualizations/mcp-wire.html) | theory + viz | 50 min |
| 2 | [Building servers](theory/03-building-servers.md) | theory | 20 min |
| 3 | [Lab 01: your first server (tool, resources, prompt, stdio)](labs/01-first-server) | lab | 60 min |
| 4 | [Lab 02: clients, adapters and an agent on two servers](labs/02-client-and-agent) | lab | 60 min |
| 5 | [Remote servers: auth and scopes](theory/04-auth-and-remote-servers.md) | theory | 25 min |
| 6 | [Lab 03: Streamable HTTP, bearer tokens, scopes](labs/03-http-and-auth) | lab | 60 min |
| 7 | [Input required and security](theory/05-input-required-and-security.md) + [input-required viz](visualizations/input-required.html) | theory + viz | 35 min |
| 8 | [Lab 04: a person in the loop with signed state](labs/04-input-required) | lab | 60 min |
| 9 | [servers & trifecta viz](visualizations/servers-and-trifecta.html) + [Lab 05: hosts vs hostile servers](labs/05-security) | viz + lab | 70 min |
| 10 | [Project: Acme MCP](project/) | project | 4–5 h |
| 11 | [Quiz + interview questions](quiz.md) | review | 30 min |

Suggested split at 5–6 h/day: **Day 1**: reading + items 1–6 · **Day 2**: items 7–9, the project (connect it to Claude Code at the end), quiz.

## How to run things
```bash
npm run verify:p5          # all Phase 5 labs + the project on scripted models (offline, free; the project needs Postgres)
npm run verify:p5:live     # same, with your .env provider for the agent parts
npx tsx phase-05-mcp/labs/03-http-and-auth/check.ts starter                   # one lab, your code
npx mcp-inspector npx tsx phase-05-mcp/labs/01-first-server/starter/server.ts  # the Inspector web UI on your server
```

## ⚠️ The concepts most people get wrong (flagged throughout)
1. **"MCP makes the agent smarter / MCP is an agent framework."** It's a protocol for exposing capabilities. The loop, stop conditions and evals are still Phase 4's job, and every server you connect costs tokens on every request (510 for the Acme server's 6 tools). → [01](theory/01-what-mcp-is.md), [Lab 02](labs/02-client-and-agent)
2. **"Approval via elicitation means the user approved it."** The *host* answers the question. It stops the **model** from acting alone, not a malicious client. Round 2 is untrusted input: sign it, bind it to the arguments and the caller, and keep the policy checks in your backend. → [05](theory/05-input-required-and-security.md), [Lab 04](labs/04-input-required)
3. **"It's just a tool, I'm not calling anything dangerous."** Tool *descriptions* reach the model the moment you connect. A real model, given a poisoned notes server, copied every customer's invoices into a note and told the user only "saved". → [05](theory/05-input-required-and-security.md), [Lab 05](labs/05-security)
4. **"Annotations and scopes in the description protect me."** `destructiveHint` is a hint, and "only SREs may roll back" in a prompt is a suggestion. Access control is `requireScopes` on the server, checked before the handler runs. → [03](theory/03-building-servers.md), [04](theory/04-auth-and-remote-servers.md)

## Real numbers measured while building this phase (2026-10-31)
| Observation | Value | Where |
|---|---|---|
| Same 3 operations, 2026-07-28 vs 2025-11-25 | 4 vs 6 HTTP requests · 5.0 KB vs 4.0 KB of JSON (the `_meta` envelope on every request) | [mcp-wire.html](visualizations/mcp-wire.html) |
| Tool definitions re-sent on every agent step | acme 510 · status 113 · handbook 129 · project (7 tools) 699 tokens | Lab 02, project |
| Live agent through 2 MCP servers (`gemini-3.5-flash-lite`) | 5 steps, 7,479 input tokens; recovered from an invented `customerId` via the server's error | Lab 02 |
| Thrown error with a secret in it | sent to the client verbatim by default (`kaboom secret=xyz`) | Lab 01 |
| `versionNegotiation: 'auto'` over stdio | starts your server process **twice** per connect (probe + real) | Lab 05, project |
| Hostile client attacks on an approval (5 kinds) | all refused; 1 refund total | Lab 04, project AC7 |
| Poisoned server, live model | listed invoices of all 3 customers, put them in a note for the attacker, told the user "saved a note" | Lab 05 |
| Same, with scan + pins | nothing leaked, but the model then rolled back production unasked | Lab 05 |
| Claude Code (Haiku) as the host | 3 turns, ~10 s, USD 0.004 per question; audit actor `claude-code` | project AC12 |
| Project acceptance tests, mock / live + real host | 12/12 in 9 s / 13/13 in 36 s | project |

## ✅ What a senior should be able to explain after this phase
- [ ] Host vs client vs server, and tools vs resources vs prompts by who controls them
- [ ] When an in-app tool beats an MCP server, and the other way round
- [ ] What 2026-07-28 removed (handshake, sessions, server→client requests) and what replaced each
- [ ] Why a stdio server must never write to stdout, and must never do side effects at startup
- [ ] The three kinds of failure (tool error, protocol error, internal error) and what each should look like on the wire
- [ ] The HTTP checklist: loopback, Host/Origin, bearer + audience, metadata discovery, scopes, rate limits, actors
- [ ] The OAuth roles in MCP, and why token passthrough is forbidden
- [ ] The input-required round trip and five attacks on round 2, with the defense for each
- [ ] Tool poisoning, rug pulls and the cross-server lethal trifecta, and what a host can do about them
- [ ] How to prove a server works: Inspector, an SDK client, hostile raw requests, a real host

## Mark it done
Tick the Phase 5 checklist in [PROGRESS.md](../PROGRESS.md).
