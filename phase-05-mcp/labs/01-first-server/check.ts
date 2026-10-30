// Usage: npx tsx check.ts [starter|solution]
// No model involved: an MCP server is plain software, tested with a real MCP client.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { connectInProcess, textOf } from '../../env/in-process.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const target = process.argv[2] ?? 'starter';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const entry = path.join(here, target, 'server.ts');
const tsx = path.join(root, 'node_modules/.bin/tsx');

async function stdioClient(mode: 'auto' | 'legacy') {
  const errors: string[] = [];
  const client = new Client({ name: 'lab01-check', version: '1.0.0' }, { versionNegotiation: { mode } });
  client.onerror = (e) => errors.push(e.message);
  await client.connect(new StdioClientTransport({ command: tsx, args: [entry], stderr: 'ignore' }));
  return { client, errors };
}

await report('a real client connects over stdio and negotiates the 2026-07-28 protocol', async () => {
  const { client, errors } = await stdioClient('auto');
  try {
    assert.equal(client.getProtocolEra(), 'modern', 'serve with serveStdio(factory) so the server can speak both protocol eras');
    assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
    assert.equal(client.getServerVersion()?.name, 'acme-handbook');
    const { tools } = await client.listTools();
    console.log(`   tools: ${tools.map((t) => t.name).join(', ')}`);
    const search = tools.find((t) => t.name === 'searchHandbook');
    assert.ok(search, 'searchHandbook must be listed');
    assert.equal(search.annotations?.readOnlyHint, true, 'a search changes nothing: say so with readOnlyHint');
    assert.ok(search.outputSchema, 'declare an outputSchema so clients can validate structuredContent');
    assert.deepEqual(errors, []);
  } finally {
    await client.close();
  }
});

await report('stdout carries only JSON-RPC: logs go to stderr', async () => {
  // What a host sees on the child's stdout. One stray console.log line corrupts the stream for every client.
  const child = spawn(tsx, [entry], { stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta } }) + '\n');
  const deadline = Date.now() + 15_000;
  while (!out.includes('"id":1') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  child.kill();
  const lines = out.split('\n').filter(Boolean);
  const bad = lines.filter((l) => {
    try {
      return JSON.parse(l).jsonrpc !== '2.0';
    } catch {
      return true;
    }
  });
  assert.ok(lines.length > 0, 'no answer to server/discover on stdout');
  assert.deepEqual(bad, [], `non-protocol output on stdout (use console.error for logs): ${bad.join(' | ').slice(0, 120)}`);
});

await report('searchHandbook returns structured, current results', async () => {
  const { client } = await connectInProcess(() => lab.createHandbookServer());
  const r = await client.callTool({ name: 'searchHandbook', arguments: { query: 'how many days do customers have to request a refund' } });
  assert.ok(!r.isError, textOf(r));
  const hits = (r.structuredContent as { hits: { source: string; uri: string }[] }).hits;
  console.log(`   top hit: ${hits[0]?.source} (${hits[0]?.uri})`);
  assert.match(hits[0]!.source, /billing-and-refunds\.md/);
  assert.equal(hits[0]!.uri, 'handbook://billing-and-refunds', 'each hit links to the resource that holds the full document');
  assert.ok(hits.length <= 3, 'default limit is 3');
  assert.ok(!JSON.stringify(hits).includes('refund-policy-2024'), 'deprecated documents must never be served');
  assert.match(textOf(r), /billing-and-refunds/, 'also return the result as text for clients that ignore structuredContent');
});

await report('bad arguments and empty results come back as tool errors the model can act on', async () => {
  const { client } = await connectInProcess(() => lab.createHandbookServer());
  const tooShort = await client.callTool({ name: 'searchHandbook', arguments: { query: 'a' } });
  assert.equal(tooShort.isError, true, 'schema validation (min length) should reject this before your handler runs');
  const none = await client.callTool({ name: 'searchHandbook', arguments: { query: 'zebra quokka xylophone' } });
  assert.equal(none.isError, true);
  console.log(`   empty result: "${textOf(none)}"`);
  assert.match(textOf(none), /handbook:\/\/|other keywords/i, 'say what to try next');
});

await report('unexpected failures do not leak internals to the client', async () => {
  const broken = async () => {
    throw new Error('connect ECONNREFUSED db.internal.acme:5432 (user=svc_handbook password=hunter2)');
  };
  const { client } = await connectInProcess(() => lab.createHandbookServer({ search: broken }));
  const origError = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(' '));
  try {
    const r = await client.callTool({ name: 'searchHandbook', arguments: { query: 'refund window' } });
    console.error = origError;
    console.log(`   client saw: "${textOf(r)}"`);
    assert.equal(r.isError, true);
    assert.doesNotMatch(textOf(r), /hunter2|db\.internal|ECONNREFUSED/, 'the raw error message reached the client (by default the SDK sends error.message as-is)');
    assert.match(textOf(r), /ref [a-z0-9]+/i, 'give a reference id so the operator can find the logged details');
    assert.ok(logged.some((l) => l.includes('ECONNREFUSED')), 'log the real error on the server (stderr)');
  } finally {
    console.error = origError;
  }
});

await report('handbook documents are resources: listed, completable, readable', async () => {
  const { client } = await connectInProcess(() => lab.createHandbookServer());
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.ok(resourceTemplates.some((t) => t.uriTemplate === 'handbook://{slug}'));
  const { resources } = await client.listResources();
  const uris = resources.map((r) => r.uri);
  console.log(`   ${uris.length} documents, e.g. ${uris.slice(0, 3).join(', ')}`);
  assert.ok(uris.includes('handbook://billing-and-refunds'));
  assert.ok(!uris.some((u) => u.includes('refund-policy-2024')), 'deprecated documents must not be listed');
  const doc = await client.readResource({ uri: 'handbook://billing-and-refunds' });
  const text = (doc.contents[0] as { text?: string }).text ?? '';
  assert.match(text, /30 days/);
  await assert.rejects(client.readResource({ uri: 'handbook://refund-policy-2024' }), 'unknown or deprecated documents are "not found"');
  const done = await client.complete({ ref: { type: 'ref/resource', uri: 'handbook://{slug}' }, argument: { name: 'slug', value: 'dep' } });
  assert.deepEqual(done.completion.values, ['deploys-and-rollbacks']);
});

await report('answerWithCitations is a prompt that carries the relevant sections as resources', async () => {
  const { client } = await connectInProcess(() => lab.createHandbookServer());
  const { prompts } = await client.listPrompts();
  assert.ok(prompts.some((p) => p.name === 'answerWithCitations' && p.arguments?.some((a) => a.name === 'question' && a.required)));
  const p = await client.getPrompt({ name: 'answerWithCitations', arguments: { question: 'When should we roll back a deploy?' } });
  const kinds = p.messages.map((m) => m.content.type);
  console.log(`   messages: ${kinds.join(', ')}`);
  assert.ok(kinds.includes('resource'), 'attach the top sections as embedded resources');
  assert.equal(kinds.at(-1), 'text', 'end with the instruction and the question');
  assert.match(JSON.stringify(p.messages.at(-1)), /cite/i);
});

await report('older (2025-11-25) clients still work', async () => {
  const { client } = await stdioClient('legacy');
  try {
    assert.equal(client.getProtocolEra(), 'legacy');
    const r = await client.callTool({ name: 'searchHandbook', arguments: { query: 'rollback' } });
    assert.ok(!r.isError);
  } finally {
    await client.close();
  }
});

await report('the MCP Inspector (CLI) lists your tools, resources and prompts', async () => {
  const inspector = path.join(root, 'node_modules/.bin/mcp-inspector');
  const run = (method: string) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(inspector, ['--cli', tsx, entry, '--method', method], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`inspector exited ${code}: ${out.slice(0, 200)}`))));
    });
  const [tools, resources, prompts] = await Promise.all([run('tools/list'), run('resources/list'), run('prompts/list')]);
  assert.match(tools, /searchHandbook/);
  assert.match(resources, /handbook:\/\/billing-and-refunds/);
  assert.match(prompts, /answerWithCitations/);
});

summary();
