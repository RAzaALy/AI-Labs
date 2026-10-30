// Bakes REAL protocol traffic into the Phase 5 visualizations (single-file HTML, works offline).
// Usage: npx tsx phase-05-mcp/visualizations/_data/generate.ts      (no key, no database: in-memory Acme world)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMcpHandler, type AuthInfo, type McpServer } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getEncoding } from 'js-tiktoken';
import { AcmeOps } from '../../../phase-04-agents/env/acme-ops.ts';
import { createAcmeServer } from '../../env/acme-server.ts';
import { createStatusServer } from '../../env/status-server.ts';
import { createHandbookServer } from '../../labs/01-first-server/solution/index.ts';
import { createRefundServer } from '../../labs/04-input-required/solution/index.ts';

const vizDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function inject(file: string, data: unknown) {
  const p = path.join(vizDir, file);
  const html = await readFile(p, 'utf8');
  const re = /(<script type="application\/json" id="viz-data">)[\s\S]*?(<\/script>)/;
  if (!re.test(html)) throw new Error(`${file}: no viz-data block`);
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  await writeFile(p, html.replace(re, `$1${json}$2`));
  console.log(`✔ ${file} (${(json.length / 1024).toFixed(1)} KB)`);
}

interface Exchange {
  method: string;
  requestHeaders: Record<string, string>;
  request: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  response: unknown;
}
const keep = (h: Headers) => Object.fromEntries([...h].filter(([k]) => /^(mcp-|content-type|accept|authorization)/i.test(k)));
const parseBody = (text: string) => {
  if (!text.trim()) return null;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) return JSON.parse(text);
  const data = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
  return data.length ? JSON.parse(data.at(-1)!) : text;
};

/** A real client talking to a real handler through fetch; every exchange recorded as it went over the wire. */
async function record(factory: (ctx: { authInfo?: AuthInfo }) => McpServer, mode: 'auto' | 'legacy', script: (c: Client) => Promise<void>, opts: { authInfo?: AuthInfo; elicit?: boolean } = {}) {
  const handler = createMcpHandler(factory);
  const log: Exchange[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const body = req.method === 'POST' ? await req.clone().text() : '';
    const res = await handler.fetch(req, { authInfo: opts.authInfo });
    const text = await res.clone().text();
    const request = body ? JSON.parse(body) : null;
    log.push({ method: (request as { method?: string })?.method ?? req.method, requestHeaders: keep(req.headers), request, status: res.status, responseHeaders: keep(res.headers), response: parseBody(text) });
    return res;
  };
  const client = new Client({ name: 'viz-host', version: '1.0.0' }, { versionNegotiation: { mode }, capabilities: opts.elicit ? { elicitation: { form: {} } } : {} });
  if (opts.elicit) client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { approve: true } }));
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3050/mcp'), { fetch: fetchFn as typeof fetch }));
  await script(client);
  await client.close();
  return log;
}

// ---------- mcp-wire.html: one tool call in each protocol era ----------
const scenario = async (c: Client) => {
  await c.listTools();
  await c.callTool({ name: 'getDeployStatus', arguments: { service: 'api' } });
  await c.callTool({ name: 'rollback', arguments: { service: 'web' } });
};
const modern = await record(() => createAcmeServer(new AcmeOps()), 'auto', scenario);
const legacy = await record(() => createAcmeServer(new AcmeOps()), 'legacy', scenario);
await inject('mcp-wire.html', { modern, legacy });

// ---------- input-required.html: a refund approval, then each attack ----------
const KEY = 'viz-only-state-key-0123456789abcdef-0123';
const alice: AuthInfo = { token: 'a', clientId: 'billing-alice', scopes: [], expiresAt: 2e9 };
const ops = new AcmeOps();
const refundFlow = await record(() => createRefundServer(ops, { stateKey: KEY }), 'auto', async (c) => void (await c.callTool({ name: 'issueRefund', arguments: { invoiceId: 'INV-20261003', amountUSD: 99, reason: 'Customer did not use the new seats' } })), { authInfo: alice, elicit: true });
await inject('input-required.html', { refundFlow: refundFlow.filter((e) => e.method === 'tools/call') });

// ---------- servers-and-trifecta.html: what each server costs in context ----------
const enc = getEncoding('o200k_base');
async function cost(name: string, factory: () => McpServer) {
  let tools: { name: string; description?: string; inputSchema: unknown }[] = [];
  await record(factory, 'auto', async (c) => void (tools = (await c.listTools()).tools));
  return { name, tools: tools.length, tokens: enc.encode(JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })))).length };
}
const costs = [await cost('acme-ops', () => createAcmeServer()), await cost('status-page', createStatusServer), await cost('acme-handbook', () => createHandbookServer())];
await inject('servers-and-trifecta.html', { costs });
