// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { FAKE_KEY, startFakeLlmServer } from '../../../shared/fake-llm-server.ts';
import { resolveProvider } from '../../../shared/llm.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const fake = await startFakeLlmServer({ chunkDelayMs: 15 });

/** A ReadableStream that delivers `bytes` in pieces of `size` bytes, like a slow network. */
function chunked(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, (i += size)));
    },
  });
}

async function collect(gen: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const RAW = ': heartbeat comment\r\n\r\ndata: {"a":1}\r\n\r\ndata: first line\ndata: second line\n\nevent: ping\ndata: سلام 👋\n\ndata: [DONE]\n\n';
const EXPECTED = ['{"a":1}', 'first line\nsecond line', 'سلام 👋', '[DONE]'];

await report('parseSSE: whole stream at once', async () => {
  assert.deepEqual(await collect(lab.parseSSE(chunked(RAW, 10_000))), EXPECTED);
});

await report('parseSSE: 1-byte chunks (splits lines AND multi-byte characters)', async () => {
  assert.deepEqual(await collect(lab.parseSSE(chunked(RAW, 1))), EXPECTED, 'if Urdu/emoji come out as "�", decode with { stream: true }');
});

const req = { messages: [{ role: 'user' as const, content: 'Streaming lets users read while the model is still writing the answer' }] };

await report('streamGemini: incremental tokens, TTFT < total, cumulative usage', async () => {
  const seen: string[] = [];
  const r = await lab.streamGemini(fake.url, FAKE_KEY, 'm', req, { onToken: (d) => seen.push(d) });
  console.log(`   ${r.chunks} chunks · TTFT ${r.ttftMs.toFixed(0)} ms · total ${r.totalMs.toFixed(0)} ms · ${r.outputTokens} output tokens`);
  assert.match(r.text, /^Echo: Streaming lets users read/);
  assert.ok(r.chunks > 5, 'many chunks expected');
  assert.equal(seen.join(''), r.text);
  assert.ok(r.ttftMs < r.totalMs);
  assert.equal(r.finishReason, 'STOP');
  assert.equal(r.outputTokens, Math.ceil(r.text.length / 4), 'take the LAST cumulative usage, do not sum chunks');
});

await report('streamOpenAICompatible: deltas, final usage chunk, [DONE] sentinel', async () => {
  const r = await lab.streamOpenAICompatible(fake.url, FAKE_KEY, 'm', req);
  assert.match(r.text, /^Echo: Streaming lets users read/);
  assert.equal(r.finishReason, 'stop');
  assert.ok(r.outputTokens > 0, 'request stream_options.include_usage, or you get no usage when streaming');
});

await report('abort mid-stream keeps the partial text (the "Stop" button)', async () => {
  const ctrl = new AbortController();
  let n = 0;
  const r = await lab.streamGemini(fake.url, FAKE_KEY, 'm', req, { signal: ctrl.signal, onToken: () => ++n === 3 && ctrl.abort() });
  console.log(`   aborted after ${r.chunks} chunks: "${r.text}"`);
  assert.equal(r.aborted, true);
  assert.ok(r.chunks >= 3 && r.chunks < 8, `expected ~3 chunks before abort, got ${r.chunks}`);
});

await fake.close();

await liveOnly('stream from real Gemini and measure TTFT', resolveProvider() === 'google', async () => {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
  process.stdout.write('   ');
  const r = await lab.streamGemini('https://generativelanguage.googleapis.com', key, 'gemini-3.5-flash-lite', { messages: [{ role: 'user', content: 'In 3 short sentences: why do LLM apps stream responses?' }] }, { onToken: (d) => process.stdout.write(d.replace(/\n/g, ' ')) });
  console.log(`\n   ${r.chunks} chunks · TTFT ${r.ttftMs.toFixed(0)} ms · total ${r.totalMs.toFixed(0)} ms · ${r.outputTokens} tokens · ${r.tokensPerSecond.toFixed(0)} tok/s`);
  assert.ok(r.text.length > 40 && r.ttftMs > 0);
});

summary();
