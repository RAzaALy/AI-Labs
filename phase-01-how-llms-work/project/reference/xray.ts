#!/usr/bin/env -S npx tsx
// LLM X-ray — reference implementation of the Phase 1 project.
// Built ON TOP of the lab solutions: that's the point. Labs give you the parts, the project wires them up.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { countTokens, tokenPieces } from '../../labs/01-tokens/solution/index.ts';
import { search } from '../../labs/02-embeddings/solution/index.ts';
import { loadModel, nextTokenLogits, sampleIndex, softmax, topK, topP } from '../../labs/03-sampling/solution/index.ts';
import { conversationInputTokens, fitToBudget, totalTokens, type Message } from '../../labs/04-context-budget/solution/index.ts';
import { PRICING, costUSD } from '../../../shared/pricing.ts';
import { seededRandom } from '../../../shared/rng.ts';

const HELP = `LLM X-ray: look inside what an LLM sees and costs.

Usage:
  xray tokens   <text> | --file <path>   [--out <tokens>]
  xray similar  --query <q> --file <docs.txt> [--k 3] [--min-score 0.3]
  xray generate <prompt> [--temperature 1] [--top-k 0] [--top-p 1] [--max-tokens 30] [--seed 42] [--show-probs]
  xray budget   --file <conversation.json> [--window 4096] [--reserve 1024]
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' },
    out: { type: 'string', default: '500' },
    query: { type: 'string' },
    k: { type: 'string', default: '3' },
    'min-score': { type: 'string', default: '0.3' },
    temperature: { type: 'string', default: '1' },
    'top-k': { type: 'string', default: '0' },
    'top-p': { type: 'string', default: '1' },
    'max-tokens': { type: 'string', default: '30' },
    seed: { type: 'string', default: '42' },
    'show-probs': { type: 'boolean', default: false },
    window: { type: 'string', default: '4096' },
    reserve: { type: 'string', default: '1024' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, ...rest] = positionals;
const num = (name: keyof typeof values) => {
  const n = Number(values[name]);
  if (!Number.isFinite(n)) fail(`--${name} must be a number`);
  return n;
};
function fail(msg: string): never {
  console.error(`error: ${msg}\n\n${HELP}`);
  process.exit(2);
}
const inputText = async () => (values.file ? await readFile(values.file, 'utf8') : rest.join(' '));

async function cmdTokens() {
  const text = await inputText();
  if (!text) fail('give some text or --file');
  const counts = await countTokens(text);
  const pieces = await tokenPieces(text, 'o200k');
  const outTokens = num('out');
  console.log(`chars: ${[...text].length}   gpt2: ${counts.gpt2} tokens   o200k: ${counts.o200k} tokens   (${(text.length / counts.o200k).toFixed(2)} chars/token)`);
  const preview = pieces.slice(0, 40).map((p) => `[${p.replace(/\n/g, '↵')}]`).join('');
  console.log(`pieces: ${preview}${pieces.length > 40 ? ` … +${pieces.length - 40} more` : ''}`);
  console.log(`\nestimated cost per call (input = o200k count, output = ${outTokens} tokens; counts differ per provider tokenizer):`);
  console.table(
    Object.keys(PRICING).map((model) => ({
      model,
      'per call $': +costUSD(model, counts.o200k, outTokens).toFixed(6),
      'per 1M calls $': Math.round(costUSD(model, counts.o200k, outTokens) * 1e6),
    })),
  );
}

async function cmdSimilar() {
  if (!values.query || !values.file) fail('similar needs --query and --file');
  const docs = (await readFile(values.file, 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean);
  const hits = await search(values.query, docs, num('k'));
  const min = num('min-score');
  for (const [i, h] of hits.entries()) console.log(`${i + 1}. ${h.score.toFixed(3)}  ${h.doc}`);
  if (hits[0] && hits[0].score < min) console.log(`\n⚠️  best score ${hits[0].score.toFixed(3)} < ${min}: probably nothing relevant. Don't answer from these.`);
  if (hits[1] && hits[0]!.score - hits[1].score < 0.02) console.log('⚠️  top results are nearly tied: similarity alone cannot decide, so a reranker would help (Phase 3).');
}

async function cmdGenerate() {
  const prompt = rest.join(' ');
  if (!prompt) fail('generate needs a prompt');
  const temperature = num('temperature');
  const k = num('top-k');
  const p = num('top-p');
  const rand = seededRandom(num('seed'));
  const { tok } = await loadModel();
  const ids = tok.encode(prompt);
  process.stdout.write(prompt);
  const started = performance.now();
  let firstTokenMs = 0;
  let generated = 0;
  for (let step = 0; step < num('max-tokens'); step++) {
    const probs = topP(topK(softmax(await nextTokenLogits(ids), temperature), k), p);
    const next = sampleIndex(probs, rand);
    if (next === tok.eos_token_id) break;
    ids.push(next);
    generated++;
    if (step === 0) firstTokenMs = performance.now() - started;
    const text = tok.decode([next]);
    process.stdout.write(values['show-probs'] ? `${text}\x1b[2m(${(probs[next]! * 100).toFixed(0)}%)\x1b[0m` : text);
  }
  const total = (performance.now() - started) / 1000;
  console.log(`\n\n— ${generated} tokens · TTFT ${firstTokenMs.toFixed(0)} ms · ${(generated / total).toFixed(1)} tokens/s · T=${temperature} top_k=${k || 'off'} top_p=${p}`);
}

async function cmdBudget() {
  if (!values.file) fail('budget needs --file conversation.json');
  const messages = JSON.parse(await readFile(values.file, 'utf8')) as Message[];
  const window = num('window');
  const reserve = num('reserve');
  const r = fitToBudget(messages, { contextWindow: window, reserveForOutput: reserve });
  console.log(`conversation: ${messages.length} messages, ${totalTokens(messages)} tokens`);
  console.log(`window ${window} − reserved output ${reserve} = input budget ${window - reserve}`);
  console.log(`kept ${r.kept.length} messages (${r.inputTokens} tokens), dropped ${r.dropped.length} oldest`);
  for (const m of r.dropped) console.log(`  ✂ ${m.role.padEnd(9)} ${m.content.slice(0, 70)}`);
  // Billing view: every assistant reply was one request that re-sent everything before it.
  const perTurn = [];
  let added = 0;
  for (const m of messages) {
    added += totalTokens([m]);
    if (m.role === 'assistant') {
      perTurn.push(added);
      added = 0;
    }
  }
  const { total } = conversationInputTokens(perTurn);
  console.log(`\nbilled input across ${perTurn.length} requests (no truncation, no cache): ${total} tokens = ${(total / totalTokens(messages)).toFixed(1)}× the conversation size`);
}

if (values.help || !command) {
  console.log(HELP);
} else {
  const commands: Record<string, () => Promise<void>> = { tokens: cmdTokens, similar: cmdSimilar, generate: cmdGenerate, budget: cmdBudget };
  const run = commands[command];
  if (!run) fail(`unknown command "${command}"`);
  await run();
}
