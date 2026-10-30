# 4. Remote servers: transport security, auth and scopes

**Time:** 25 min · **Lab:** [`labs/03-http-and-auth`](../labs/03-http-and-auth) · **Project:** AC4, AC5, AC10

## The idea
A **stdio** server runs as the user who started it: it can do whatever that user can do, and there is nobody else to authenticate. The audit log should still say who (`ACME_ACTOR`, or the OS user).

An **HTTP** server is a public API the moment it listens. Defend it like one, in this order:

1. **Bind to loopback** for local servers (`127.0.0.1`, not `0.0.0.0`). Otherwise anyone on the same Wi-Fi can reach it.
2. **Validate `Host` and `Origin`** (DNS rebinding). A web page on `evil.example` can make its own name resolve to `127.0.0.1` and POST to your local server from the victim's browser. The `Host` header still says `evil.example`, so refuse it: `localhostHostValidation()`. (Lab 03 found that `fetch` silently drops a custom `Host` header, so test it with `node:http`.)
3. **Authenticate every request.** Stateless means there's no "logged-in connection": each `POST` carries `Authorization: Bearer …`.
4. **Authorize per tool with scopes.** `scopeChallenge: requireScopes('ops:deploy')` answers `403 insufficient_scope` with a `WWW-Authenticate` challenge, which tells the client exactly which scope to request (step-up auth).
5. **Record the actor** (the token's `clientId`/subject) on every side effect, and **rate-limit per client**: an agent stuck in a loop is a client hammering your DB.

**OAuth, the MCP way.** The MCP server is an OAuth 2.1 **resource server**, never the authorization server:
- No token → `401` + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`.
- That **Protected Resource Metadata** document (RFC 9728) names the authorization server(s) and the scopes. The client discovers the AS from there, gets the user to log in, and comes back with a token.
- Tokens must be issued **for this server** (audience / RFC 8707 `resource`), checked with `expectedResource`. A token minted for another API must be refused.
- Clients identify themselves with **Client ID Metadata Documents** (a URL describing the client). Dynamic Client Registration is deprecated in 2026-07-28.

Lab 03 and the project use a token table instead of a real authorization server so everything runs offline. Phase 8 wires a real one. The resource-server side (everything above) is identical either way.

## Web-engineering analogy
It's an API gateway checklist: bind address, CSRF-style origin checks, bearer auth on every call, RBAC via scopes, per-client rate limits, audit logs. `WWW-Authenticate` + `resource_metadata` is the API telling an unauthenticated client where the login page is.

## Trade-offs
| Per-tool scopes | Coarse "can use the server" |
|---|---|
| Least privilege; a support bot can't roll back prod | Simpler to configure |
| Clients may need step-up flows | One leaked token = everything |

## ⚠️ Common mistakes
1. **Token passthrough.** Forwarding the client's token to *your* downstream APIs (or accepting tokens not issued for you) makes you a **confused deputy**. Validate the audience, and use your own credentials downstream.
2. **Auth on stdio by copy-paste.** A local stdio server doesn't need tokens; it needs to **not** run with more privilege than the user.
3. **Scopes in the prompt.** "Only SREs may roll back" in a description is not access control. Lab 03's support token gets `InsufficientScopeError`, and the deploy row is unchanged.
4. **Forgetting `Origin`.** Host checks stop DNS rebinding; Origin checks stop a browser page from talking to an allowed host.

## Senior check
You can explain the 401 → metadata → authorization server → token → retry flow, why the MCP server must check the token's audience, and where DNS rebinding bites local servers.
