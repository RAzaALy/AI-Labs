// Lab 03: the same kind of server, now as a remote service over Streamable HTTP. With stdio the user who started
// the process was the only caller. Over HTTP anyone who can reach the port is a caller, so the server must:
//   1. reject requests from web pages that DNS-rebind to localhost (Host / Origin checks)
//   2. authenticate every request (Bearer token → AuthInfo) and tell clients where to get a token (RFC 9728)
//   3. authorize per tool (scopes) and record WHO did what
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  McpServer,
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  requireScopes,
  verifyBearerToken,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import type { AcmeOps } from '../../../../phase-04-agents/env/acme-ops.ts';
import { run } from '../../../env/acme-server.ts';

export const SCOPES = { read: 'ops:read', deploy: 'ops:deploy', tickets: 'tickets:write' } as const;
export interface CallLog {
  actor: string;
  tool: string;
  ok: boolean;
}

/**
 * Verifies opaque tokens against a table. In production this is JWT validation (signature, issuer, audience, exp)
 * or RFC 7662 introspection against your authorization server: the MCP server is only the RESOURCE server.
 */
export function tokenVerifier(tokens: Record<string, { clientId: string; scopes: string[] }>, resource: URL): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token) {
      const t = tokens[token];
      if (!t) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown or revoked token');
      return { token, clientId: t.clientId, scopes: t.scopes, expiresAt: Math.floor(Date.now() / 1000) + 3600, resource };
    },
  };
}

/** One server instance per request (stateless), built for THIS caller: their identity is in every audit entry. */
export function createScopedServer(ops: AcmeOps, calls: CallLog[], authInfo?: AuthInfo): McpServer {
  const actor = authInfo?.clientId ?? 'anonymous';
  const server = new McpServer({ name: 'acme-ops-http', version: '1.0.0' });
  const audited = async (tool: string, fn: () => unknown) => {
    const r = await run(tool, fn);
    calls.push({ actor, tool, ok: !r.isError });
    return r;
  };
  const service = z.enum(['api', 'web', 'worker']);
  server.registerTool(
    'getDeployStatus',
    { description: 'Current production deploy of a service.', inputSchema: z.object({ service }), annotations: { readOnlyHint: true }, scopeChallenge: requireScopes(SCOPES.read) },
    ({ service }) => audited('getDeployStatus', () => ops.getDeployStatus(service)),
  );
  server.registerTool(
    'rollback',
    { description: 'Roll a DEGRADED service back to its previous version.', inputSchema: z.object({ service }), annotations: { destructiveHint: true }, scopeChallenge: requireScopes(SCOPES.deploy) },
    ({ service }) => audited('rollback', () => ops.rollback(service)),
  );
  server.registerTool(
    'createTicket',
    {
      description: 'Open a ticket for a human team.',
      inputSchema: z.object({ subject: z.string(), body: z.string(), priority: z.enum(['low', 'normal', 'high', 'urgent']) }),
      scopeChallenge: requireScopes(SCOPES.tickets),
    },
    (input) => audited('createTicket', () => ops.createTicket(input)),
  );
  return server;
}

async function sendWeb(res: ServerResponse, r: Response) {
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}

export async function startHttpServer(opts: {
  ops: AcmeOps;
  tokens: Record<string, { clientId: string; scopes: string[] }>;
  port?: number;
  authorizationServer?: string;
}) {
  const calls: CallLog[] = [];
  const handler = createMcpHandler(({ authInfo }) => createScopedServer(opts.ops, calls, authInfo), { maxRequestBodySize: 64 * 1024 });
  const mcp = toNodeHandler(handler);
  const validHost = localhostHostValidation();
  const validOrigin = localhostOriginValidation();
  let resource!: URL;
  let metadataUrl!: string;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // 1. DNS rebinding: a page on evil.example can resolve its own name to 127.0.0.1 and POST here from your browser.
    //    The Host (and Origin) header still says evil.example, so refuse anything that isn't localhost.
    if (!validHost(req, res) || !validOrigin(req, res)) return;
    const url = new URL(req.url ?? '/', resource);

    // 2. RFC 9728 Protected Resource Metadata: how a client learns which authorization server issues tokens for us.
    if (req.method === 'GET' && url.pathname === new URL(metadataUrl).pathname) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ resource: resource.href, authorization_servers: [opts.authorizationServer ?? 'https://auth.acme.example'], scopes_supported: Object.values(SCOPES), bearer_methods_supported: ['header'], resource_name: 'Acme ops MCP' }));
      return;
    }
    if (url.pathname !== '/mcp') return void res.writeHead(404).end();

    // 3. Authenticate every request: there are no sessions, so there is nothing to "log in" once.
    try {
      const authInfo = await verifyBearerToken(req.headers.authorization, { verifier: tokenVerifier(opts.tokens, resource), resourceMetadataUrl: metadataUrl, expectedResource: resource });
      (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo; // toNodeHandler passes req.auth to the factory
    } catch (e) {
      return sendWeb(res, bearerAuthChallengeResponse(e, { resourceMetadataUrl: metadataUrl }));
    }
    await mcp(req, res);
  });

  // Bind to loopback only: 0.0.0.0 would expose it to your whole network (and the café's Wi-Fi).
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  resource = new URL(`http://localhost:${port}/mcp`);
  metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  return {
    url: resource,
    metadataUrl,
    calls,
    address: server.address() as AddressInfo,
    close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}
