// Acceptance tests for the LLM X-ray CLI. Runs the CLI as a real subprocess.
// Usage: npx tsx phase-01-how-llms-work/project/check.ts [starter|reference]
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { report, summary } from '../../shared/lab-harness.ts';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? 'starter';
if (!['starter', 'reference'].includes(target)) throw new Error('target must be "starter" or "reference"');
const cli = path.join(here, target, 'xray.ts');
const fixtures = path.join(here, 'fixtures');
console.log(`\n▶ LLM X-ray acceptance tests — ${target}\n`);

async function xray(...args: string[]): Promise<{ out: string; code: number }> {
  try {
    const { stdout, stderr } = await run('npx', ['tsx', cli, ...args], { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
    return { out: stdout + stderr, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { out: (err.stdout ?? '') + (err.stderr ?? ''), code: err.code ?? 1 };
  }
}

await report('AC1 tokens: exact o200k count, pieces and a cost table', async () => {
  const { out, code } = await xray('tokens', 'Hello world');
  assert.equal(code, 0, out);
  assert.match(out, /o200k: 2 tokens/);
  assert.match(out, /\[Hello\]\[ world\]/);
  assert.match(out, /claude-sonnet-5-5/);
});

await report('AC2 similar: finds the rollback doc for a paraphrased question', async () => {
  const { out, code } = await xray('similar', '--query', 'how do I undo a bad deployment?', '--file', path.join(fixtures, 'docs.txt'), '--k', '2');
  assert.equal(code, 0, out);
  const first = out.split('\n').find((l) => l.startsWith('1.'));
  assert.ok(first?.includes('roll back'), `first hit should be the rollback doc, got: ${first}`);
});

await report('AC3 similar: warns when nothing is relevant', async () => {
  const { out } = await xray('similar', '--query', 'best pizza toppings in Naples', '--file', path.join(fixtures, 'docs.txt'), '--min-score', '0.3');
  assert.match(out, /probably nothing relevant/);
});

await report('AC4 generate: greedy streams "Paris" and reports TTFT + throughput', async () => {
  const { out, code } = await xray('generate', 'The capital of France is', '--temperature', '0', '--max-tokens', '3');
  assert.equal(code, 0, out);
  assert.match(out, /The capital of France is Paris/);
  assert.match(out, /TTFT \d+ ms/);
  assert.match(out, /tokens\/s/);
});

await report('AC5 budget: drops the oldest turns, which hold the user\'s name', async () => {
  const { out, code } = await xray('budget', '--file', path.join(fixtures, 'conversation.json'), '--window', '400', '--reserve', '150');
  assert.equal(code, 0, out);
  assert.match(out, /dropped [1-9]\d* oldest/);
  assert.match(out, /✂ user\s+My name is Sara/, 'the turn with the name should be among the dropped');
  assert.match(out, /× the conversation size/);
});

await report('AC6 bad input: unknown command exits with code 2 and prints help', async () => {
  const { out, code } = await xray('bogus');
  assert.equal(code, 2);
  assert.match(out, /Usage:/);
});

summary();
