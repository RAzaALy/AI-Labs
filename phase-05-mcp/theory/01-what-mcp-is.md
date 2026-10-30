# 1. What MCP is (and isn't)

**Time:** 20 min · **Visualization:** [`mcp-wire.html`](../visualizations/mcp-wire.html) · **Lab:** [`labs/01-first-server`](../labs/01-first-server)

## The idea
In Phase 4 the tools lived **inside** your app: `tool({ execute })` called `OpsStore` in the same process. That works for one app. It stops working when the same capability should be usable from Claude Code, a teammate's IDE, a support chatbot and your own agent, each written by someone else.

The **Model Context Protocol** standardizes the boundary. Three roles:

| Role | What it is | Example |
|---|---|---|
| **Host** | The app the user talks to. Runs the model loop, decides what reaches the model, asks the user. | Claude Code, your agent CLI |
| **Client** | A connection object inside the host, **one per server**. Speaks the protocol. | `new Client(...)` from `@modelcontextprotocol/client` |
| **Server** | A program that exposes capabilities. Knows nothing about the model. | the Acme ops server you build in this phase |

And three primitives, which differ in **who decides to use them**:

| Primitive | Controlled by | Use it for | This phase |
|---|---|---|---|
| **Tools** | the **model** (it chooses to call them) | actions and lookups with arguments | `searchHandbook`, `rollback`, `issueRefund` |
| **Resources** | the **application or user** (attached as context) | documents and data addressed by URI | `handbook://billing-and-refunds`, `ops://deploys` |
| **Prompts** | the **user** (usually a slash command) | reusable workflows with arguments | `incidentReview(service)` |

The model never talks to a server. It emits a tool call, the host's client sends JSON-RPC, and the host puts the result back into the model's context. **MCP is plumbing.** It doesn't make the model smarter, and it doesn't run the agent loop. Phase 4's loop, stop conditions and evals all still apply.

## Web-engineering analogy
MCP is to AI tools what the **Language Server Protocol** is to editors. Before LSP, every editor needed its own TypeScript plugin. After it, one `tsserver` serves every editor. One Acme MCP server serves every host. Tools ≈ RPC endpoints, resources ≈ GET-able URLs, prompts ≈ saved queries/templates.

## Trade-offs: MCP server or in-app tools?
| In-app tools (Phase 4) | MCP server (this phase) |
|---|---|
| One process: simplest, fastest, easy to test | A process or service boundary: more moving parts |
| Only your app can use them | Any MCP host can use them, including ones you didn't write |
| You control prompt, tools and loop together | Hosts decide how your tools are described to *their* model |
| Auth is your app's session | Auth is per request (tokens, scopes), like any public API |

Rule of thumb: keep tools **in-app** when only one app needs them. Ship an **MCP server** when several hosts should share a capability, or when the capability belongs to another team (they own the server, you own the host).

## ⚠️ Common mistakes
1. **"MCP is an agent framework."** It's a protocol for exposing capabilities. Your Phase 4 agent becomes an MCP *host* by adding clients. Nothing else changes.
2. **Everything as a tool.** A document the user wants in context is a **resource**, and a canned workflow is a **prompt**. Making them tools forces the model to discover and call them, which costs tokens and steps.
3. **"Connect every server you can find."** Each server's tool definitions go into **every** request (Lab 02: 510 tokens for one server), and every server you add widens the attack surface (Lab 05). Connect what the task needs.
4. **Trusting a server because it's "just a tool".** Its descriptions are text that goes straight into your model's context. A server can steer your model without ever being called (Lab 05).

## Senior check
You can draw host/client/server for a real product, say for each capability whether it should be a tool, resource or prompt, and argue when an MCP server isn't worth its boundary.
