// Remote transport: Streamable HTTP on loopback, stateless (one server instance per request).
// Every request: Host/Origin check → bearer token → per-client rate limit → MCP, with the token's clientId as actor.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  verifyBearerToken,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import type { Sql } from '../../../../phase-04-agents/project/reference/lib/ops.ts';
import { SCOPES, createAcmeMcpServer } from './server.ts';

export type Tokens = Record<string, { clientId: string; scopes: string[] }>;

/** Tokens come from the environment (ACME_MCP_TOKENS, JSON), never from code. In production: JWTs from your IdP. */
export function tokensFromEnv(): Tokens {
  try {
    const t = JSON.parse(process.env.ACME_MCP_TOKENS ?? '{}') as Tokens;
    if (Object.keys(t).length) return t;
  } catch {}
  console.error('ACME_MCP_TOKENS is empty. Set it in the repo-root .env, e.g.\n  ACME_MCP_TOKENS={"<long-random-token>":{"clientId":"sre-oncall","scopes":["ops:read","ops:deploy","tickets:write","billing:refund"]}}');
  process.exit(1);
}

/** A sliding window per client: an agent stuck in a loop must not be able to hammer the database. */
function rateLimiter(perMinute: number) {
  const hits = new Map<string, number[]>();
  return (clientId: string) => {
    const now = Date.now();
    const recent = (hits.get(clientId) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(clientId, recent);
    return recent.length <= perMinute ? 0 : Math.ceil((60_000 - (now - recent[0]!)) / 1000);
  };
}

async function sendWeb(res: ServerResponse, r: Response) {
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}

export async function startHttp(opts: { sql: Sql; tokens: Tokens; stateKey: string; port?: number; ratePerMinute?: number; fault?: string }) {
  const handler = createMcpHandler(({ authInfo }) => createAcmeMcpServer({ sql: opts.sql, actor: authInfo?.clientId ?? 'anonymous', stateKey: opts.stateKey, fault: opts.fault }), {
    maxRequestBodySize: 256 * 1024,
    onerror: (e) => console.error('[acme-mcp] request error:', e.message),
  });
  const mcp = toNodeHandler(handler);
  const validHost = localhostHostValidation();
  const validOrigin = localhostOriginValidation();
  const limited = rateLimiter(opts.ratePerMinute ?? 120);
  let resource!: URL;
  let metadataUrl!: string;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (!validHost(req, res) || !validOrigin(req, res)) return; // DNS rebinding
    const path = new URL(req.url ?? '/', resource).pathname;
    if (req.method === 'GET' && path === new URL(metadataUrl).pathname) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ resource: resource.href, authorization_servers: [process.env.ACME_AUTH_ISSUER ?? 'https://auth.acme.example'], scopes_supported: Object.values(SCOPES), bearer_methods_supported: ['header'], resource_name: 'Acme ops (MCP)' }));
    }
    if (req.method === 'GET' && path === '/healthz') return void res.writeHead(200).end('ok');
    if (path !== '/mcp') return void res.writeHead(404).end();
    let authInfo: AuthInfo;
    try {
      authInfo = await verifyBearerToken(req.headers.authorization, {
        verifier: {
          verifyAccessToken: async (token) => {
            const t = opts.tokens[token];
            if (!t) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown or revoked token');
            return { token, clientId: t.clientId, scopes: t.scopes, expiresAt: Math.floor(Date.now() / 1000) + 3600, resource };
          },
        },
        resourceMetadataUrl: metadataUrl,
        expectedResource: resource,
      });
    } catch (e) {
      return sendWeb(res, bearerAuthChallengeResponse(e, { resourceMetadataUrl: metadataUrl }));
    }
    const retryAfter = limited(authInfo.clientId);
    if (retryAfter) {
      res.writeHead(429, { 'retry-after': String(retryAfter), 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ error: 'rate_limited', retryAfterSeconds: retryAfter }));
    }
    (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    await mcp(req, res);
  });

  await new Promise<void>((r) => server.listen(opts.port ?? 3050, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  resource = new URL(`http://localhost:${port}/mcp`);
  metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  return { url: resource, metadataUrl, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) };
}
