# Lab 03: Streamable HTTP, auth and scopes (≈60 min)

**Concept:** [04 remote servers](../../theory/04-auth-and-remote-servers.md) · **No key, no database needed**

The Acme tools as a remote service. Every check goes over a real TCP socket.

## Task
1. `tokenVerifier(tokens, resource)`: unknown token → `OAuthError(InvalidToken)`; known → `AuthInfo` with `expiresAt` (required) and `resource` (the audience).
2. `createScopedServer(ops, calls, authInfo)`: `getDeployStatus` (`ops:read`), `rollback` (`ops:deploy`), `createTicket` (`tickets:write`) via `scopeChallenge: requireScopes(...)`; every call logged with the caller's `clientId`.
3. In `startHttpServer`: Host/Origin validation, `verifyBearerToken` → `req.auth` (the Node adapter passes it to your factory), `bearerAuthChallengeResponse` on failure, the protected-resource metadata route, and the right bind address.

## Run
```bash
npx tsx phase-05-mcp/labs/03-http-and-auth/check.ts starter
```

## Measured when this lab was built (2026-10-31)
```
401 · WWW-Authenticate: Bearer error="invalid_token", error_description="Missing Authorization header",
      resource_metadata="http://localhost:34227/.well-known/oauth-protected-resource/mcp"
metadata: {"resource":"http://localhost:34227/mcp","authorization_servers":["https://auth.acme.example"],"scopes_supported":["ops:read","ops:deploy","tickets:write"],...}
Host: evil.example → 403 · Origin: https://evil.example → 403
rollback as support-bot: InsufficientScopeError: Insufficient scope: required "ops:deploy"
audit: [{"actor":"sre-oncall","tool":"rollback","ok":true}]
200 KB body → 413                                                   → 7 passed in 2.1 s
```

## What to notice
- **`fetch` can't test DNS rebinding.** It silently drops a custom `Host` header (a forbidden header, like in browsers). The first version of this check "passed" for the wrong reason (a 400 for the body). The check now uses `node:http`.
- **There is no session to log in to.** Every request carries the bearer token; a second client sees the first one's rollback because state lives in the backend, not the connection, and responses have no `Mcp-Session-Id`.
- **Scopes are enforced before the handler.** The support bot's rollback never ran: the deploy row is untouched, and the client got a typed error it could use to request a bigger token.
- **The metadata document is the start of OAuth.** A real client follows `resource_metadata` → authorization server → login → token. Here the AS is fictional; the resource-server half is real.
