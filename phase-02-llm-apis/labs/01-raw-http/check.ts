// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { FAKE_KEY, startFakeLlmServer } from '../../../shared/fake-llm-server.ts';
import { resolveProvider } from '../../../shared/llm.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const fake = await startFakeLlmServer();
const req = { system: 'Be terse.', messages: [{ role: 'user' as const, content: 'Hi' }, { role: 'assistant' as const, content: 'Hello!' }, { role: 'user' as const, content: 'What is a token?' }] };

await report('Gemini wire format: roles, systemInstruction, generationConfig', () => {
  const b = lab.buildGeminiBody({ ...req, temperature: 0.2, maxOutputTokens: 100 }) as any;
  assert.deepEqual(b.systemInstruction, { parts: [{ text: 'Be terse.' }] });
  assert.deepEqual(b.contents.map((c: any) => c.role), ['user', 'model', 'user'], 'assistant must become "model"');
  assert.equal(b.contents[2].parts[0].text, 'What is a token?');
  assert.deepEqual(b.generationConfig, { temperature: 0.2, maxOutputTokens: 100 });
});

await report('OpenAI wire format: system is the first message', () => {
  const b = lab.buildOpenAIBody({ ...req, maxOutputTokens: 50 }, 'some-model') as any;
  assert.equal(b.model, 'some-model');
  assert.deepEqual(b.messages.map((m: any) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(b.max_tokens, 50);
});

await report('parse responses into one normalized shape (incl. hidden reasoning tokens)', () => {
  // Real shape returned by gemini-3.5-flash for "Reply with exactly: pong": 99 thinking tokens!
  const g = lab.parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'pong' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, thoughtsTokenCount: 99, totalTokenCount: 105 } });
  assert.deepEqual(g, { text: 'pong', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 100, reasoningTokens: 99 } });
  const o = lab.parseOpenAIResponse({ choices: [{ message: { content: 'Hi.' }, finish_reason: 'length' }], usage: { prompt_tokens: 7, completion_tokens: 2 } });
  assert.deepEqual(o, { text: 'Hi.', finishReason: 'length', usage: { inputTokens: 7, outputTokens: 2, reasoningTokens: 0 } });
});

await report('call both formats over real HTTP (local fake server)', async () => {
  const a = await lab.callGemini(fake.url, FAKE_KEY, 'fake-model', req);
  const b = await lab.callOpenAICompatible(fake.url, FAKE_KEY, 'fake-model', req);
  assert.match(a.text, /Echo: What is a token\?/);
  assert.match(b.text, /Echo: What is a token\?/);
  assert.ok(a.usage.inputTokens > 0 && b.usage.outputTokens > 0);
  const geminiReq = fake.requests.find((r) => r.path.endsWith(':generateContent'))!;
  assert.equal(geminiReq.headers['x-goog-api-key'], FAKE_KEY, 'API key must be sent as a header');
  assert.ok(!geminiReq.path.includes('key='), 'never put the key in the URL');
});

await report('finishReason "length" when max tokens cuts the answer', async () => {
  const r = await lab.callGemini(fake.url, FAKE_KEY, 'fake-model', { messages: [{ role: 'user', content: 'Tell me a very long story about the sea and ships and storms' }], maxOutputTokens: 3 });
  assert.equal(r.finishReason, 'length', 'a truncated answer must be detectable, or you will ship half-sentences');
});

await report('HttpError carries status and Retry-After', async () => {
  fake.faults = [{ status: 429, retryAfter: '7' }];
  await assert.rejects(lab.callGemini(fake.url, FAKE_KEY, 'm', req), (e: any) => e instanceof lab.HttpError && e.status === 429 && e.retryAfterMs === 7000);
  await assert.rejects(lab.callGemini(fake.url, 'wrong-key', 'm', req), (e: any) => e.status === 403);
});

await report('withRetry: retries 503/429, honours Retry-After, uses jitter', async () => {
  fake.faults = [{ status: 503 }, { status: 429, retryAfter: '2' }];
  const before = fake.requests.length;
  const delays: number[] = [];
  const r = await lab.withRetry(() => lab.callGemini(fake.url, FAKE_KEY, 'm', req), { baseDelayMs: 100, sleep: async (ms) => void delays.push(ms), random: () => 0.5 });
  assert.match(r.text, /Echo/);
  assert.equal(fake.requests.length - before, 3, 'two failures + one success');
  assert.equal(delays[0], 50, 'attempt 1: random(0.5) × base 100 × 2^0');
  assert.ok(delays[1]! >= 2000, `attempt 2 must wait at least Retry-After (2s), got ${delays[1]}`);
});

await report('withRetry: never retries 4xx client errors, and gives up after N retries', async () => {
  let calls = 0;
  await assert.rejects(lab.withRetry(async () => { calls++; throw new lab.HttpError(400, 'bad request'); }, { sleep: async () => {} }));
  assert.equal(calls, 1, '400 is your bug, so retrying just burns quota');
  calls = 0;
  await assert.rejects(lab.withRetry(async () => { calls++; throw new lab.HttpError(503, 'overloaded'); }, { retries: 2, sleep: async () => {} }));
  assert.equal(calls, 3, '1 try + 2 retries');
});

await fake.close();

const live = resolveProvider() === 'google';
await liveOnly('same question, two wire formats, real Gemini', live, async () => {
  const base = 'https://generativelanguage.googleapis.com';
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
  const q = { system: 'Answer in one short sentence.', messages: [{ role: 'user' as const, content: 'What is an API rate limit?' }] };
  const retry = { onRetry: ({ attempt, delayMs }: { attempt: number; delayMs: number }) => console.log(`   retry #${attempt} in ${Math.round(delayMs)} ms`) };
  const a = await lab.withRetry(() => lab.callGemini(base, key, 'gemini-3.5-flash-lite', q), retry);
  const b = await lab.withRetry(() => lab.callOpenAICompatible(base, key, 'gemini-3.5-flash-lite', q), retry);
  console.log(`   native: ${a.text.trim()}  [${a.usage.inputTokens} in / ${a.usage.outputTokens} out]`);
  console.log(`   openai: ${b.text.trim()}  [${b.usage.inputTokens} in / ${b.usage.outputTokens} out]`);
  assert.ok(a.text.length > 10 && b.text.length > 10);
  assert.equal(a.finishReason, 'stop');
});

summary();
