// Acceptance tests for Docs Chat. Ingests into the TEST database, builds and starts the Next.js app,
// then talks to it over HTTP exactly like the browser does (UI message stream over SSE).
// Usage: npx tsx phase-03-rag/project/check.ts [starter|reference]
// Needs Postgres (npm run db:up). Mock model + local embeddings by default; LIVE=1 uses the provider in .env.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
import { report, summary } from '../../shared/lab-harness.ts';

const target = process.argv[2] ?? 'starter';
if (!['starter', 'reference'].includes(target)) throw new Error('target must be "starter" or "reference"');
const live = process.env.LIVE === '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, target);
const corpus = path.join(here, '../corpus/acme-handbook');
try {
  process.loadEnvFile(path.join(here, '../../.env'));
} catch {}
const dbUrl = process.env.DATABASE_URL_TEST ?? 'postgres://app:app@localhost:5433/rag_test';
const port = 3100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATABASE_URL: dbUrl, LLM_PROVIDER: live ? process.env.LLM_PROVIDER ?? '' : 'mock', NEXT_TELEMETRY_DISABLED: '1' };
console.log(`\n▶ Docs Chat acceptance tests: ${target} · ${live ? 'live' : 'mock model + local embeddings'}\n`);

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: appDir, env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} failed:\n${out.slice(-3000)}`))));
  });
}
const ingest = async (dir: string) => {
  const out = await run('npx', ['tsx', 'scripts/ingest.ts', '--dir', dir]);
  const m = out.match(/added (\d+) · updated (\d+) · unchanged (\d+) · removed (\d+) · (\d+) chunks/);
  assert.ok(m, `ingest must print its summary line, got:\n${out.slice(-800)}`);
  const [added, updated, unchanged, removed, chunks] = m.slice(1).map(Number) as [number, number, number, number, number];
  return { added, updated, unchanged, removed, chunks };
};

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
const ask = async (text: string) => {
  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }] }) });
  assert.equal(res.status, 200);
  const chunks: Chunk[] = (await res.text()).split('\n\n').map((e) => e.replace(/^data: /, '').trim()).filter((d) => d && d !== '[DONE]').map((d) => JSON.parse(d));
  const sources = chunks.find((c) => c.type === 'data-sources')?.data ?? [];
  const answer = chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('');
  const meta = Object.assign({}, ...chunks.filter((c) => c.messageMetadata).map((c) => c.messageMetadata));
  return { chunks, sources, answer, meta };
};

const sql = postgres(dbUrl, { onnotice: () => {} });
const scratch = await mkdtemp(path.join(tmpdir(), 'docs-chat-'));
try {
  await report('Postgres is reachable (npm run db:up)', async () => {
    await sql`SELECT 1`;
    // Start from empty tables for whichever embedder this run uses.
    for (const { tablename } of await sql<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE tablename LIKE 'kb_%'`) await sql.unsafe(`DROP TABLE IF EXISTS ${tablename} CASCADE`);
  });

  await report('AC1 ingestion is an idempotent sync (add → skip unchanged → update → remove)', async () => {
    await cp(corpus, scratch, { recursive: true });
    const first = await ingest(scratch);
    assert.equal(first.added, 11, 'all 11 documents added on the first run');
    assert.ok(first.chunks >= 30, 'documents are split into chunks');
    const again = await ingest(scratch);
    assert.deepEqual([again.added, again.updated, again.unchanged, again.chunks], [0, 0, 11, 0], 'a re-run with no changes must embed nothing');
    const f = path.join(scratch, 'feature-flags.md');
    await writeFile(f, (await readFile(f, 'utf8')) + '\n## Flag reviews\n\nEvery quarter, stale flags older than 90 days are reviewed and removed.\n');
    await rm(path.join(scratch, 'onboarding-new-engineers.md'));
    const changed = await ingest(scratch);
    assert.deepEqual([changed.added, changed.updated, changed.unchanged, changed.removed], [0, 1, 9, 1], 'one updated, one removed');
    const restored = await ingest(corpus); // back to the real handbook for the remaining tests
    assert.deepEqual([restored.added, restored.updated, restored.removed], [1, 1, 0]);
    const { n } = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'kb_chunks_%'`)[0]!;
    assert.equal(n, 1, 'exactly one chunks table for the current embedder');
  });

  await report('AC2 hidden HTML comments (prompt-injection carriers) never reach the index', async () => {
    const t = (await sql<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE tablename LIKE 'kb_chunks_%'`)[0]?.tablename;
    assert.ok(t, 'no chunks table: run ingestion first');
    const { total, n } = (await sql<{ total: number; n: number }[]>`SELECT count(*)::int AS total, count(*) FILTER (WHERE content LIKE '%<!--%' OR content ILIKE '%ignore all previous instructions%')::int AS n FROM ${sql(t)}`)[0]!;
    assert.ok(total > 0, 'the index is empty');
    assert.equal(n, 0);
  });

  await report('app builds (types check) and starts', start);

  await report('AC3 /api/search: exact identifiers work (E-4290) and deprecated docs are excluded', async () => {
    const r = await (await fetch(`${base}/api/search?q=${encodeURIComponent('E-4290')}`)).json();
    assert.equal(r.hits[0]?.file, 'api-errors.md', 'an exact error code must find the error reference first');
    const refund = await (await fetch(`${base}/api/search?q=${encodeURIComponent('refund policy days')}&k=10`)).json();
    assert.ok(refund.hits.length > 0);
    assert.ok(refund.hits.every((h: { file: string }) => h.file !== 'refund-policy-2024.md'), 'the deprecated 2024 policy must never be retrieved');
    assert.equal((await fetch(`${base}/api/search`)).status, 400);
  });

  await report('AC4 chat streams sources BEFORE the answer, with valid inline citations', async () => {
    const { chunks, sources, answer, meta } = await ask('How do I undo a bad release?');
    const iSources = chunks.findIndex((c) => c.type === 'data-sources');
    const iText = chunks.findIndex((c) => c.type === 'text-delta');
    assert.ok(iSources >= 0 && iText > iSources, 'data-sources must arrive before the first text-delta');
    assert.ok(chunks.filter((c) => c.type === 'text-delta').length > 1, 'the answer must stream');
    assert.ok(sources.length >= 3 && sources.every((s: any) => s.n && s.file && s.content), 'sources carry n, file, section, content');
    assert.match(answer, /\[\d+\]/, 'answer must cite inline');
    assert.equal(meta.answerable, true);
    assert.ok(meta.citations.length > 0 && meta.problems.length === 0, `citations validated: ${JSON.stringify(meta)}`);
    const cited = sources.find((s: any) => s.n === meta.citations[0]);
    assert.equal(cited.file, 'deploys-and-rollbacks.md');
    for (const k of ['modelId', 'embedder', 'retrievalMs', 'finishedAt']) assert.ok(meta[k] !== undefined, `metadata.${k} missing`);
  });

  await report('AC5 questions the docs do not answer get "I don\'t know", not a guess', async () => {
    for (const q of ['What is the office wifi password?', 'Who is the CEO of Acme?']) {
      const { answer, meta } = await ask(q);
      assert.match(answer, /^I (don['’]t|do not) know/i, `${q} → ${answer}`);
      assert.equal(meta.answerable, false);
    }
  });

  await report('AC6 the conflicting deprecated policy does not leak into answers', async () => {
    const { answer, sources } = await ask('How many days do customers have to request a refund?');
    assert.ok(sources.every((s: any) => s.file !== 'refund-policy-2024.md'));
    assert.doesNotMatch(answer, /14 days/);
    if (!live) assert.match(answer, /30 days/);
  });

  await report('AC7 invalid requests are rejected with 4xx, not 500', async () => {
    const post = (body: unknown) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ messages: [{ id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }] })).status, 400);
    assert.equal((await post({ messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(2500) }] }] })).status, 413);
  });

  await report('AC8 eval CLI reports retrieval metrics and passes its thresholds', async () => {
    const out = await run('npx', ['tsx', 'scripts/eval.ts', '--min-recall', '0.9', '--min-mrr', '0.7']);
    const json = JSON.parse(out.match(/JSON (\{.*\})/)?.[1] ?? 'null');
    assert.ok(json, 'eval must print a JSON line with its metrics');
    console.log(`   recall@5 ${json['recall@5'].toFixed(3)} · MRR ${json.mrr.toFixed(3)}`);
    assert.ok(json['recall@5'] >= 0.9 && json.mrr >= 0.7);
    // The gate must actually gate: an impossible threshold has to fail the process.
    await assert.rejects(run('npx', ['tsx', 'scripts/eval.ts', '--min-mrr', '1.01']), 'eval must exit non-zero below its thresholds');
  });
} finally {
  stop();
  await sql.end();
  await rm(scratch, { recursive: true, force: true });
}
summary();
