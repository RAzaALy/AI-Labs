// Usage: npx tsx check.ts [starter|solution]
// Everything here goes over a real TCP socket, the way a remote host would reach your server.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { AcmeOps } from '../../../phase-04-agents/env/acme-ops.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);

const TOKENS = {
  'tok-support-123': { clientId: 'support-bot', scopes: ['ops:read', 'tickets:write'] },
  'tok-sre-456': { clientId: 'sre-oncall', scopes: ['ops:read', 'ops:deploy', 'tickets:write'] },
};

async function withServer(fn: (s: Awaited<ReturnType<Impl['startHttpServer']>>, ops: AcmeOps) => Promise<void>) {
  const ops = new AcmeOps();
  const s = await lab.startHttpServer({ ops, tokens: TOKENS });
  try {
    await fn(s, ops);
  } finally {
    await s.close();
  }
}

async function clientFor(url: URL, token: string) {
  const client = new Client({ name: 'lab03-check', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}
/** node:http, not fetch: fetch silently drops a custom Host header (it is a "forbidden" header in browsers too). */
const rawPost = (url: URL, headers: Record<string, string>) =>
  new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: url.port, path: url.pathname, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => (res.resume(), resolve(res.statusCode ?? 0)));
    req.on('error', reject);
    req.end('{}');
  });
const post = (url: URL | string, headers: Record<string, string> = {}, body = '{}') =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });

await report('listens on loopback only', async () => {
  await withServer(async (s) => {
    assert.equal(s.address.address, '127.0.0.1', 'bind to 127.0.0.1, not 0.0.0.0 (every machine on your network could call it)');
  });
});

await report('no token → 401 with a pointer to the protected resource metadata', async () => {
  await withServer(async (s) => {
    const r = await post(s.url);
    const challenge = r.headers.get('www-authenticate') ?? '';
    console.log(`   ${r.status} · WWW-Authenticate: ${challenge}`);
    assert.equal(r.status, 401);
    assert.match(challenge, /^Bearer /);
    assert.match(challenge, /resource_metadata="[^"]+oauth-protected-resource/);
    const prm = await (await fetch(s.metadataUrl)).json();
    console.log(`   metadata: ${JSON.stringify(prm)}`);
    assert.equal(prm.resource, s.url.href, 'resource = this server URL: tokens must be issued FOR this server (audience)');
    assert.ok(Array.isArray(prm.authorization_servers) && prm.authorization_servers.length > 0);
    assert.ok(prm.scopes_supported.includes('ops:deploy'));
    const bad = await post(s.url, { authorization: 'Bearer not-a-real-token' });
    assert.equal(bad.status, 401);
    assert.match(bad.headers.get('www-authenticate') ?? '', /invalid_token/);
  });
});

await report('DNS rebinding: a foreign Host or Origin is refused, even with a valid token', async () => {
  await withServer(async (s) => {
    const auth = { authorization: 'Bearer tok-sre-456' };
    const host = await rawPost(s.url, { ...auth, host: `evil.example:${s.url.port}` });
    const origin = await rawPost(s.url, { ...auth, host: `localhost:${s.url.port}`, origin: 'https://evil.example' });
    console.log(`   Host: evil.example → ${host} · Origin: https://evil.example → ${origin}`);
    assert.equal(host, 403);
    assert.equal(origin, 403);
  });
});

await report('a reader can look but not roll back (insufficient_scope), and nothing changes', async () => {
  await withServer(async (s, ops) => {
    const client = await clientFor(s.url, 'tok-support-123');
    try {
      assert.equal(client.getProtocolEra(), 'modern');
      const status = await client.callTool({ name: 'getDeployStatus', arguments: { service: 'api' } });
      assert.equal((status.structuredContent as { status: string }).status, 'degraded');
      const err = await client.callTool({ name: 'rollback', arguments: { service: 'api' } }).then(
        () => undefined,
        (e: Error) => e,
      );
      console.log(`   rollback as support-bot: ${err?.constructor.name}: ${err?.message}`);
      assert.ok(err, 'rollback must be refused for a token without ops:deploy');
      assert.match(err.message, /scope/i);
      assert.equal(ops.world.deploys[0]!.status, 'degraded', 'the refused call must not have run');
    } finally {
      await client.close();
    }
  });
});

await report('the on-call SRE can roll back, and the audit names them', async () => {
  await withServer(async (s, ops) => {
    const client = await clientFor(s.url, 'tok-sre-456');
    try {
      const r = await client.callTool({ name: 'rollback', arguments: { service: 'api' } });
      assert.ok(!r.isError);
      assert.equal(ops.world.deploys[0]!.status, 'healthy');
      console.log(`   audit: ${JSON.stringify(s.calls)}`);
      assert.deepEqual(s.calls.at(-1), { actor: 'sre-oncall', tool: 'rollback', ok: true });
    } finally {
      await client.close();
    }
  });
});

await report('stateless: no session id, and state lives in your backend, not the connection', async () => {
  await withServer(async (s) => {
    const sre = await clientFor(s.url, 'tok-sre-456');
    const support = await clientFor(s.url, 'tok-support-123');
    try {
      await sre.callTool({ name: 'rollback', arguments: { service: 'api' } });
      const seen = await support.callTool({ name: 'getDeployStatus', arguments: { service: 'api' } });
      assert.equal((seen.structuredContent as { status: string }).status, 'healthy', 'a different client sees the change: the world is shared server state');
      const raw = await post(s.url, { authorization: 'Bearer tok-support-123', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' }, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }));
      assert.equal(raw.status, 200);
      assert.equal(raw.headers.get('mcp-session-id'), null, 'the 2026-07-28 protocol has no sessions');
    } finally {
      await Promise.all([sre.close(), support.close()]);
    }
  });
});

await report('oversized requests are refused before parsing', async () => {
  await withServer(async (s) => {
    const r = await post(s.url, { authorization: 'Bearer tok-sre-456' }, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'createTicket', arguments: { subject: 'x'.repeat(200_000) } } }));
    console.log(`   200 KB body → ${r.status}`);
    assert.equal(r.status, 413);
  });
});

summary();
