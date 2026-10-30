// Acceptance tests for Acme MCP. Runs against the TEST database, drives the server the way hosts do:
// the Inspector over stdio, the MCP SDK client over HTTP (and raw HTTP, like a hostile client), and your own agent.
// Usage: npx tsx phase-05-mcp/project/check.ts [starter|reference]
//        LIVE=1 ...  the agent uses the provider in .env  ·  HOST=1 ...  also run Claude Code against the server
// Needs Postgres (npm run db:up).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { report, summary } from '../../shared/lab-harness.ts';
import { connectInProcess, textOf, type Elicit } from '../env/in-process.ts';

const target = process.argv[2] ?? 'starter';
if (!['starter', 'reference'].includes(target)) throw new Error('target must be "starter" or "reference"');
const live = process.env.LIVE === '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {}
// Everything below (this process AND the servers it starts) uses the test database and the test secrets.
const dbUrl = process.env.DATABASE_URL_TEST ?? 'postgres://app:app@localhost:5433/rag_test';
const STATE_KEY = 'check-only-state-key-0123456789abcdef-xyz';
Object.assign(process.env, { DATABASE_URL: dbUrl, ACME_STATE_KEY: STATE_KEY, LLM_PROVIDER: live ? (process.env.LLM_PROVIDER ?? '') : 'mock' });
const TOKENS = {
  'tok-sre-check': { clientId: 'sre-oncall', scopes: ['ops:read', 'ops:deploy', 'tickets:write', 'billing:refund'] },
  'tok-support-check': { clientId: 'support-bot', scopes: ['ops:read', 'tickets:write'] },
};
console.log(`\n▶ Acme MCP acceptance tests: ${target} · agent: ${live ? 'live' : 'mock model'}\n`);

const dir = path.join(here, target, 'src');
const { createAcmeMcpServer } = (await import(path.join(dir, 'server.ts'))) as typeof import('./reference/src/server.ts');
const { startHttp } = (await import(path.join(dir, 'http.ts'))) as typeof import('./reference/src/http.ts');
const { runAgent } = (await import(path.join(dir, 'agent.ts'))) as typeof import('./reference/src/agent.ts');
const { db, seed, snapshot } = await import('../../phase-04-agents/project/reference/lib/ops.ts');
const { closeHandbook } = await import('../../phase-04-agents/project/reference/lib/handbook.ts');
const { getModel } = await import('../../shared/llm.ts');
const sql = db();
const tsx = path.join(root, 'node_modules/.bin/tsx');
const stdioEntry = path.join(dir, 'stdio.ts');

function run(cmd: string, args: string[], cwd = root, extraEnv: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...extraEnv } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(' ')} failed (${code}):\n${out.slice(-1500)}`))));
  });
}
const inProc = (clientId = 'sre-oncall', scopes = TOKENS['tok-sre-check'].scopes, elicit?: Elicit) =>
  connectInProcess(({ authInfo }) => createAcmeMcpServer({ sql, actor: authInfo?.clientId ?? 'anonymous', stateKey: STATE_KEY }), { authInfo: { token: 't', clientId, scopes, expiresAt: 2e9 }, elicit });
const approve = (answer: boolean, asked: string[] = []) => async (p: { message: string }) => (asked.push(p.message), answer ? { action: 'accept' as const, content: { approve: true } } : { action: 'decline' as const });
const refunds = async () => (await snapshot(sql)).refunds as unknown as { invoiceId: string }[];
const AYESHA = { invoiceId: 'INV-20261003', amountUSD: 99, reason: 'Customer asked for a refund' };

try {
  await report('setup: test database seeded, Phase 3 handbook index ingested', async () => {
    await seed(sql);
    await run('npx', ['tsx', 'scripts/ingest.ts'], path.join(root, 'phase-03-rag/project/reference'));
  });

  await report('AC1 stdio: the Inspector lists 7 tools, the handbook resources and the prompt; old and new clients connect', async () => {
    const inspector = path.join(root, 'node_modules/.bin/mcp-inspector');
    const [tools, templates, prompts] = await Promise.all(['tools/list', 'resources/templates/list', 'prompts/list'].map((m) => run(inspector, ['--cli', tsx, stdioEntry, '--method', m])));
    const names = [...tools!.matchAll(/"name": "(\w+)"/g)].map((m) => m[1]);
    console.log(`   tools: ${names.join(', ')}`);
    for (const t of ['searchHandbook', 'findCustomers', 'listInvoices', 'getDeployStatus', 'rollback', 'createTicket', 'issueRefund']) assert.ok(names.includes(t), `missing tool ${t}`);
    assert.match(templates!, /handbook:\/\/\{slug\}/);
    assert.match(prompts!, /incidentReview/);
    for (const mode of ['auto', 'legacy'] as const) {
      const c = new Client({ name: 'ac1', version: '1' }, { versionNegotiation: { mode } });
      await c.connect(new StdioClientTransport({ command: tsx, args: [stdioEntry], env: process.env as Record<string, string>, stderr: 'ignore' }));
      assert.equal(c.getProtocolEra(), mode === 'auto' ? 'modern' : 'legacy');
      await c.close();
    }
  });

  await report('AC2 searchHandbook goes through Phase 3 hybrid search and returns the CURRENT policy', async () => {
    const { client } = await inProc();
    const r = await client.callTool({ name: 'searchHandbook', arguments: { query: 'What is our refund policy, how many days?' } });
    const hits = (r.structuredContent as { hits: { source: string; excerpt: string }[] }).hits;
    console.log(`   ${hits.map((h) => h.source).join(' · ')}`);
    assert.match(hits[0]!.source, /billing-and-refunds/);
    assert.ok(!hits.some((h) => /refund-policy-2024/.test(h.source)), 'the deprecated 2024 policy must not come back');
  });

  await report('AC3 resources and prompts: handbook docs, live deploys, an incident-review prompt', async () => {
    await seed(sql);
    const { client } = await inProc();
    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === 'handbook://billing-and-refunds'));
    assert.ok(!resources.some((r) => /refund-policy-2024/.test(r.uri)));
    const deploys = JSON.parse(((await client.readResource({ uri: 'ops://deploys' })).contents[0] as { text: string }).text);
    assert.equal(deploys.find((d: { service: string }) => d.service === 'api').status, 'degraded');
    const p = await client.getPrompt({ name: 'incidentReview', arguments: { service: 'api' } });
    assert.ok(p.messages.some((m) => m.content.type === 'resource'), 'attach the live deploys as an embedded resource');
  });

  const http = await startHttp({ sql, tokens: TOKENS, stateKey: STATE_KEY, port: 0, ratePerMinute: 1000 });
  const httpClient = async (token: string) => {
    const c = new Client({ name: 'ac', version: '1' }, { versionNegotiation: { mode: 'auto' } });
    await c.connect(new StreamableHTTPClientTransport(http.url, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    return c;
  };
  try {
    await report('AC4 HTTP: 401 + resource metadata without a token; foreign Host refused; huge bodies refused', async () => {
      const r = await fetch(http.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 401);
      assert.match(r.headers.get('www-authenticate') ?? '', /resource_metadata=/);
      const prm = await (await fetch(http.metadataUrl)).json();
      assert.equal(prm.resource, http.url.href);
      assert.ok(prm.scopes_supported.includes('billing:refund'));
      const { request } = await import('node:http');
      const hostStatus = await new Promise<number>((resolve) => {
        const q = request({ host: '127.0.0.1', port: http.url.port, path: '/mcp', method: 'POST', headers: { host: 'evil.example', authorization: 'Bearer tok-sre-check' } }, (res) => (res.resume(), resolve(res.statusCode!)));
        q.end('{}');
      });
      assert.equal(hostStatus, 403);
      const big = await fetch(http.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer tok-sre-check' }, body: JSON.stringify({ x: 'y'.repeat(400_000) }) });
      assert.equal(big.status, 413);
    });

    await report('AC5 scopes: support can read but not roll back; the SRE can; audit rows name each caller', async () => {
      await seed(sql);
      const support = await httpClient('tok-support-check');
      const sre = await httpClient('tok-sre-check');
      try {
        assert.equal(support.getProtocolEra(), 'modern');
        await support.callTool({ name: 'getDeployStatus', arguments: { service: 'api' } });
        await assert.rejects(support.callTool({ name: 'rollback', arguments: { service: 'api' } }), /scope/i);
        assert.equal(((await snapshot(sql)).deploys as unknown as { service: string; status: string }[]).find((d) => d.service === 'api')!.status, 'degraded');
        const ok = await sre.callTool({ name: 'rollback', arguments: { service: 'api' } });
        assert.ok(!ok.isError, textOf(ok));
        const audit = (await snapshot(sql)).audit as unknown as { actor: string; action: string }[];
        console.log(`   audit: ${audit.slice(0, 3).map((a) => `${a.actor}:${a.action}`).join(', ')}`);
        assert.equal(audit[0]!.actor, 'sre-oncall');
        assert.ok(audit.some((a) => a.actor === 'support-bot' && a.action === 'getDeployStatus'));
      } finally {
        await Promise.all([support.close(), sre.close()]);
      }
    });

    await report('AC6 a refund waits for a person: no refund before approval, one after, none when declined', async () => {
      await seed(sql);
      const asked: string[] = [];
      const yes = await inProc(undefined, undefined, approve(true, asked));
      const r = await yes.client.callTool({ name: 'issueRefund', arguments: AYESHA });
      console.log(`   approver saw: "${asked[0]}"`);
      assert.match(asked[0] ?? '', /USD 99.*Ayesha Khan/);
      assert.equal((r.structuredContent as { refunded: boolean }).refunded, true, textOf(r));
      assert.equal((await refunds()).length, 1);
      const no = await inProc(undefined, undefined, approve(false));
      const d = await no.client.callTool({ name: 'issueRefund', arguments: { invoiceId: 'INV-20261010', amountUSD: 29, reason: 'test' } });
      assert.match(textOf(d), /nothing was refunded/i);
      assert.equal((await refunds()).length, 1);
    });

    await report('AC7 hostile clients: pre-filled approval, swapped arguments and replays never refund extra', async () => {
      await seed(sql);
      const { rawCall } = await inProc();
      const yes = { approval: { action: 'accept', content: { approve: true } } };
      const prefilled = await rawCall('issueRefund', { arguments: AYESHA, inputResponses: yes });
      assert.equal(prefilled.result?.resultType, 'input_required', 'an approval nobody asked for must not count');
      const state = prefilled.result!.requestState as string;
      const swapped = await rawCall('issueRefund', { arguments: { ...AYESHA, invoiceId: 'INV-20261001', amountUSD: 399 }, inputResponses: yes, requestState: state });
      assert.ok(swapped.error || swapped.result?.isError, 'approval for INV-20261003 must not refund INV-20261001');
      const retry = () => rawCall('issueRefund', { arguments: AYESHA, inputResponses: yes, requestState: state });
      const [a, b] = [await retry(), await retry()];
      console.log(`   first: ${a.result?.structuredContent?.refundId} · replay: replayed=${b.result?.structuredContent?.replayed}`);
      assert.equal((await refunds()).length, 1);
      assert.equal(b.result?.structuredContent?.replayed, true);
    });

    await report('AC8 policy before people: a 42-day-old charge fails at once, nobody is asked', async () => {
      await seed(sql);
      const asked: string[] = [];
      const { client } = await inProc(undefined, undefined, approve(true, asked));
      const r = await client.callTool({ name: 'issueRefund', arguments: { invoiceId: 'INV-20260903', amountUSD: 99, reason: 'late' } });
      assert.equal(r.isError, true);
      assert.match(textOf(r), /42 days/);
      assert.equal(asked.length, 0);
    });

    await report('AC9 unexpected errors reach the client as a reference id, not as internals', async () => {
      const { client } = await connectInProcess(() => createAcmeMcpServer({ sql, actor: 'x', stateKey: STATE_KEY, fault: 'listInvoices' }));
      const orig = console.error;
      console.error = () => {};
      try {
        const r = await client.callTool({ name: 'listInvoices', arguments: { customerId: 'C-101' } });
        console.error = orig;
        console.log(`   client saw: "${textOf(r).slice(0, 100)}"`);
        assert.equal(r.isError, true);
        assert.doesNotMatch(textOf(r), /password|ECONNREFUSED|10\.0\./);
        assert.match(textOf(r), /ref [0-9a-f]+/);
      } finally {
        console.error = orig;
      }
    });

    await report('AC10 a client that floods the server gets 429 + Retry-After', async () => {
      const limited = await startHttp({ sql, tokens: TOKENS, stateKey: STATE_KEY, port: 0, ratePerMinute: 3 });
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 5; i++) {
          const r = await fetch(limited.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok-support-check' }, body: '{}' });
          statuses.push(r.status);
          if (r.status === 429) assert.ok(Number(r.headers.get('retry-after')) > 0);
        }
        console.log(`   statuses: ${statuses.join(', ')}`);
        assert.equal(statuses.at(-1), 429);
      } finally {
        await limited.close();
      }
    });

    await report(`AC11 your own agent fixes the api through the MCP server over HTTP (${live ? 'live' : 'mock'} model)`, async () => {
      await seed(sql);
      const r = await runAgent('Customers report errors from the API since this morning. Investigate and fix it following our handbook, including any follow-up the handbook requires.', {
        url: http.url,
        token: 'tok-sre-check',
        approver: async () => false,
        model: live ? getModel().model : undefined,
      });
      console.log(`   ${r.calls.map((c) => c.slice(0, 70)).join('\n   → ')}\n   ${r.steps} steps · ${r.inputTokens} input tokens · "${r.text.slice(0, 120)}"`);
      const s = await snapshot(sql);
      assert.equal((s.deploys as unknown as { service: string; status: string }[]).find((d) => d.service === 'api')!.status, 'healthy');
      assert.ok(s.tickets.length >= 1, 'the handbook requires a post-incident review ticket');
      assert.ok((s.audit as unknown as { actor: string }[]).every((a) => a.actor === 'sre-oncall'));
    });
  } finally {
    await http.close();
  }

  if (process.env.HOST === '1') {
    await report('AC12 a real host: Claude Code uses the server over stdio', async () => {
      await seed(sql);
      const cfg = JSON.stringify({ mcpServers: { acme: { command: tsx, args: [stdioEntry], env: { DATABASE_URL: dbUrl, ACME_STATE_KEY: STATE_KEY, ACME_ACTOR: 'claude-code' } } } });
      const out = await run('claude', ['-p', 'Using the acme MCP server, what is the deploy status and error rate of the api service? One line.', '--mcp-config', cfg, '--strict-mcp-config', '--allowedTools', 'mcp__acme__getDeployStatus', '--model', 'haiku', '--output-format', 'json'], '/tmp');
      const j = JSON.parse(out.slice(out.indexOf('{')));
      console.log(`   Claude Code: "${j.result}" · ${j.num_turns} turns · USD ${Number(j.total_cost_usd).toFixed(4)}`);
      assert.match(j.result, /degraded/i);
      assert.match(j.result, /6\.4/);
      const audit = (await snapshot(sql)).audit as unknown as { actor: string; action: string }[];
      assert.ok(audit.some((a) => a.actor === 'claude-code' && a.action === 'getDeployStatus'), 'the audit log should show the host as the actor');
    });
  } else console.log('⏭️  AC12 a real host (Claude Code) uses the server (run with HOST=1; uses your Claude Code login)');
} finally {
  await seed(sql).catch(() => {});
  await Promise.allSettled([sql.end({ timeout: 5 }), closeHandbook()]);
}
summary();
