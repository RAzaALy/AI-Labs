// Acceptance tests for Support Copilot. Builds and starts the Next.js app, then talks to it over HTTP
// exactly like the browser does (UI message stream over SSE).
// Usage: npx tsx phase-02-llm-apis/project/check.ts [starter|reference]
// Mock model by default (offline, deterministic). LIVE=1 uses the provider in .env and relaxes text assertions.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { report, summary } from '../../shared/lab-harness.ts';

const target = process.argv[2] ?? 'starter';
if (!['starter', 'reference'].includes(target)) throw new Error('target must be "starter" or "reference"');
const live = process.env.LIVE === '1';
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), target);
const port = 3100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, LLM_PROVIDER: live ? process.env.LLM_PROVIDER ?? '' : 'mock', NEXT_TELEMETRY_DISABLED: '1' };
console.log(`\n▶ Support Copilot acceptance tests: ${target} · ${live ? 'live' : 'mock model'}\n`);

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: appDir, env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} failed:\n${out.slice(-3000)}`))));
  });
}

let server: ChildProcess | undefined;
async function start() {
  await run('npx', ['next', 'build']);
  server = spawn('npx', ['next', 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: appDir, env, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}
const stop = () => server?.pid && process.kill(-server.pid, 'SIGTERM');

type Chunk = { type: string; [k: string]: any };
const userMsg = (text: string, id = 'u1') => ({ id, role: 'user', parts: [{ type: 'text', text }] });

async function chat(body: unknown, opts: { signal?: AbortSignal } = {}): Promise<{ status: number; chunks: Chunk[]; json?: any }> {
  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: opts.signal });
  if (!res.headers.get('content-type')?.includes('text/event-stream')) return { status: res.status, chunks: [], json: await res.json().catch(() => null) };
  const text = await res.text();
  const chunks = text.split('\n\n').map((e) => e.replace(/^data: /, '').trim()).filter((d) => d && d !== '[DONE]').map((d) => JSON.parse(d));
  return { status: res.status, chunks };
}
const textOf = (chunks: Chunk[]) => chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('');
const finishMeta = (chunks: Chunk[]) => chunks.find((c) => c.type === 'finish')?.messageMetadata;

try {
  await report('app builds (types check) and starts', start);

  await report('AC1 streams text deltas + usage/cost metadata on finish', async () => {
    const { status, chunks } = await chat({ messages: [userMsg('Hello there, what can you do?')] });
    assert.equal(status, 200);
    const deltas = chunks.filter((c) => c.type === 'text-delta');
    assert.ok(deltas.length > 1, 'the answer must arrive as multiple deltas (streaming)');
    if (!live) assert.match(textOf(chunks), /You said: Hello there/);
    const meta = finishMeta(chunks);
    assert.ok(meta, 'finish chunk must carry messageMetadata');
    for (const k of ['modelId', 'inputTokens', 'outputTokens', 'costUSD']) assert.ok(meta[k] !== undefined, `metadata.${k} missing`);
    assert.ok(meta.costUSD > 0 && meta.inputTokens > 0);
  });

  await report('AC2 tool calling: order lookup runs on the server, result streamed to the UI', async () => {
    const { chunks } = await chat({ messages: [userMsg('Where is order ORD-1001?')] });
    const call = chunks.find((c) => c.type === 'tool-input-available' && c.toolName === 'getOrderStatus');
    assert.ok(call, 'expected a getOrderStatus tool call');
    assert.equal(call.input.orderId.toUpperCase(), 'ORD-1001');
    const out = chunks.find((c) => c.type === 'tool-output-available' && c.toolCallId === call.toolCallId);
    assert.equal(out?.output?.status, 'shipped');
    assert.match(textOf(chunks), /shipped/i);
  });

  await report('AC3 tool errors become a graceful answer, not a 500', async () => {
    const { status, chunks } = await chat({ messages: [userMsg('Where is order ORD-9999?')] });
    assert.equal(status, 200);
    const err = chunks.find((c) => c.type === 'tool-output-error');
    assert.ok(err, 'expected a tool-output-error chunk');
    assert.match(err.errorText, /not found/i);
    assert.ok(textOf(chunks).length > 0, 'the model still answers the user');
  });

  await report('AC4 knowledge-base tool finds the right policy', async () => {
    const { chunks } = await chat({ messages: [userMsg('How long are logs retained?')] });
    const out = chunks.find((c) => c.type === 'tool-output-available' && Array.isArray(c.output?.hits));
    assert.ok(out, 'expected a searchKnowledgeBase result');
    assert.match(out.output.hits[0].text, /Logs are retained/);
  });

  await report('AC5 multi-step usage is summed across the tool loop', async () => {
    const single = finishMeta((await chat({ messages: [userMsg('Hello')] })).chunks);
    const multi = finishMeta((await chat({ messages: [userMsg('Where is order ORD-1002?')] })).chunks);
    assert.ok(multi.inputTokens > single.inputTokens, `tool loop (${multi.inputTokens}) should bill more input than a single call (${single.inputTokens})`);
  });

  await report('AC6 budget guard refuses before spending (HTTP 402)', async () => {
    const r = await chat({ messages: [userMsg('Hello')], budgetRemainingUSD: 0.0000001 });
    assert.equal(r.status, 402);
    assert.equal(r.json?.error, 'budget');
  });

  await report('AC7 invalid requests are rejected with 400', async () => {
    assert.equal((await chat({ messages: [] })).status, 400);
    assert.equal((await chat({ nope: true })).status, 400);
  });

  await report('AC8 structured output: conversation → validated ticket', async () => {
    const res = await fetch(`${base}/api/ticket`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // A realistic conversation: includes a tool call + result and ENDS with an assistant turn.
      body: JSON.stringify({
        messages: [
          userMsg('I was charged twice for ORD-1001 and I want a refund today!'),
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              { type: 'tool-getOrderStatus', toolCallId: 'c1', state: 'output-available', input: { orderId: 'ORD-1001' }, output: { orderId: 'ORD-1001', status: 'shipped', totalUSD: 129.99 } },
              { type: 'text', text: 'Sorry about that. I will get billing to refund the duplicate.' },
            ],
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const { ticket, costUSD } = await res.json();
    assert.equal(ticket.category, 'billing');
    assert.equal(ticket.orderId, 'ORD-1001');
    assert.ok(['low', 'medium', 'high', 'urgent'].includes(ticket.priority));
    assert.ok(costUSD > 0);
  });

  await report('AC9 client abort mid-stream does not break the server', async () => {
    const ctrl = new AbortController();
    const p = chat({ messages: [userMsg('Where is order ORD-1001?')] }, { signal: ctrl.signal }).catch((e) => e);
    setTimeout(() => ctrl.abort(), 30);
    assert.equal((await p as Error).name, 'AbortError');
    const after = await chat({ messages: [userMsg('Hello again')] });
    assert.equal(after.status, 200, 'server keeps serving after an aborted stream');
  });
} finally {
  stop();
}
summary();
