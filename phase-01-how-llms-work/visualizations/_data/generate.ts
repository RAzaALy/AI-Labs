// Regenerates the REAL model data embedded in the Phase 1 visualizations.
// Usage: npx tsx phase-01-how-llms-work/visualizations/_data/generate.ts
// It rewrites the <script type="application/json" id="viz-data"> block inside each HTML file,
// so every visualization stays a single self-contained file that works offline.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AutoModelForCausalLM, AutoTokenizer, pipeline, Tensor } from '@huggingface/transformers';
import { MODELS, TINY_LM_DTYPE, EMBEDDER_DTYPE } from '../../../shared/local-models.ts';

const vizDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function inject(file: string, data: unknown) {
  const p = path.join(vizDir, file);
  const html = await readFile(p, 'utf8');
  const re = /(<script type="application\/json" id="viz-data">)[\s\S]*?(<\/script>)/;
  if (!re.test(html)) throw new Error(`${file}: no viz-data block`);
  // Escape "</" so the JSON can never close the script tag.
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  await writeFile(p, html.replace(re, `$1${json}$2`));
  console.log(`✔ ${file} (${(json.length / 1024).toFixed(1)} KB of data)`);
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

// ---------- 1. Embedding space: real 384-dim vectors from all-MiniLM-L6-v2 ----------
const SENTENCES: Record<string, string[]> = {
  deploys: [
    'The deploy succeeded.',
    'The deploy did not succeed.',
    'The release went out without problems.',
    'Roll back the release to the previous version.',
    'The CI pipeline failed on the integration tests.',
    'We ship to production every Friday afternoon.',
    'Kubernetes restarted the crashed container.',
  ],
  databases: [
    'Add an index to speed up the slow SQL query.',
    'Postgres backups run every night.',
    'The migration added a new column to the users table.',
    'Use a transaction so both writes succeed or fail together.',
    'Redis caches the session data in memory.',
    'The query planner chose a sequential scan.',
  ],
  food: [
    'This pasta recipe needs fresh basil and garlic.',
    'I had a delicious biryani for dinner.',
    'Bake the bread at 220 degrees for thirty minutes.',
    'The café serves great espresso.',
    'Chop the onions finely before frying them.',
    'Mango is my favourite summer fruit.',
  ],
  sports: [
    'The striker scored in the final minute.',
    'Pakistan won the cricket match by six wickets.',
    'She finished the marathon in under three hours.',
    'The tennis final went to five sets.',
    'Our team lost the championship game.',
    'He trains at the gym every morning.',
  ],
  pets: [
    'My cat sleeps on the keyboard all day.',
    'The puppy chewed my new shoes.',
    'Dogs need a walk at least twice a day.',
    'The kitten is chasing a laser pointer.',
    'Feed the goldfish once a day.',
    'Our dog barks at the mail carrier.',
  ],
  money: [
    'The stock market fell sharply today.',
    'Interest rates were raised by the central bank.',
    'Send the invoice to the client by Monday.',
    'Our cloud bill doubled this month.',
    'Save a portion of your salary every month.',
    'The startup raised a seed funding round.',
  ],
};

async function embeddingData() {
  const fx = await pipeline('feature-extraction', MODELS.embedder, { dtype: EMBEDDER_DTYPE });
  const items = Object.entries(SENTENCES).flatMap(([cluster, ss]) => ss.map((text) => ({ text, cluster })));
  const out = await fx(items.map((i) => i.text), { pooling: 'mean', normalize: true });
  const vecs = out.tolist() as number[][];
  return {
    model: MODELS.embedder,
    dtype: EMBEDDER_DTYPE,
    dims: vecs[0]!.length,
    items: items.map((it, i) => ({ ...it, v: vecs[i]!.map((x) => round(x, 4)) })),
  };
}

// ---------- 2. Sampling: real next-token logits from SmolLM2-135M ----------
const PROMPTS = [
  'The capital of France is',
  'My favourite programming language is',
  'To deploy the app, run',
  'Once upon a time, there was a',
  'The best way to learn AI engineering is to',
];

async function samplingData() {
  const tok = await AutoTokenizer.from_pretrained(MODELS.tinyLm);
  const model = await AutoModelForCausalLM.from_pretrained(MODELS.tinyLm, { dtype: TINY_LM_DTYPE });
  const prompts = [];
  for (const prompt of PROMPTS) {
    const ids = tok.encode(prompt);
    const shape = [1, ids.length];
    const { logits } = await model({
      input_ids: new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), shape),
      attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),
    });
    const [, seq, vocab] = logits.dims as [number, number, number];
    const row = Array.from((logits.data as Float32Array).subarray((seq - 1) * vocab, seq * vocab));
    const order = row.map((z, id) => ({ z, id })).sort((a, b) => b.z - a.z);
    const TOP = 40;
    const top = order.slice(0, TOP).map(({ z, id }) => ({ t: tok.decode([id]), z: round(z, 3) }));
    // Compress the remaining ~49k logits into a histogram so the page can compute the
    // exact-ish probability mass of "everything else" at any temperature.
    const tail = order.slice(TOP).map((o) => o.z);
    const lo = Math.min(...tail);
    const hi = Math.max(...tail);
    const BINS = 60;
    const bins = Array.from({ length: BINS }, () => ({ n: 0, sum: 0 }));
    for (const z of tail) {
      const b = Math.min(BINS - 1, Math.floor(((z - lo) / (hi - lo)) * BINS));
      bins[b]!.n++;
      bins[b]!.sum += z;
    }
    prompts.push({
      prompt,
      tokens: ids.map((id) => tok.decode([id])),
      top,
      tail: bins.filter((b) => b.n > 0).map((b) => ({ n: b.n, z: round(b.sum / b.n, 3) })),
      vocab,
    });
  }
  return { model: MODELS.tinyLm, prompts };
}

// ---------- 3. Pipeline: real tokens/ids for the step-through ----------
async function pipelineData() {
  const tok = await AutoTokenizer.from_pretrained(MODELS.tinyLm);
  const model = await AutoModelForCausalLM.from_pretrained(MODELS.tinyLm, { dtype: TINY_LM_DTYPE });
  const text = 'The capital of France is';
  const ids = tok.encode(text);

  // Training view: one forward pass over a full sentence predicts EVERY next token in parallel
  // ("teacher forcing"). p(target) per position is exactly what the cross-entropy loss scores.
  const sentence = 'The capital of France is Paris.';
  const sIds = tok.encode(sentence);
  const shape = [1, sIds.length];
  const { logits } = await model({
    input_ids: new Tensor('int64', BigInt64Array.from(sIds.map(BigInt)), shape),
    attention_mask: new Tensor('int64', new BigInt64Array(sIds.length).fill(1n), shape),
  });
  const [, seq, vocab] = logits.dims as [number, number, number];
  const data = logits.data as Float32Array;
  const teacher = [];
  for (let pos = 0; pos < seq - 1; pos++) {
    const row = data.subarray(pos * vocab, (pos + 1) * vocab);
    let max = -Infinity;
    for (const z of row) if (z > max) max = z;
    let Z = 0;
    for (const z of row) Z += Math.exp(z - max);
    const target = sIds[pos + 1]!;
    let best = 0;
    for (let i = 1; i < vocab; i++) if (row[i]! > row[best]!) best = i;
    teacher.push({
      context: tok.decode(sIds.slice(0, pos + 1)),
      target: tok.decode([target]),
      p: round(Math.exp(row[target]! - max) / Z, 4),
      guess: tok.decode([best]),
    });
  }
  // Real greedy continuation of the prompt, for the inference column.
  const gen = [...ids];
  const greedy: string[] = [];
  for (let step = 0; step < 4; step++) {
    const s = [1, gen.length];
    const out = await model({
      input_ids: new Tensor('int64', BigInt64Array.from(gen.map(BigInt)), s),
      attention_mask: new Tensor('int64', new BigInt64Array(gen.length).fill(1n), s),
    });
    const [, len, V] = out.logits.dims as [number, number, number];
    const row = (out.logits.data as Float32Array).subarray((len - 1) * V, len * V);
    let best = 0;
    for (let i = 1; i < V; i++) if (row[i]! > row[best]!) best = i;
    gen.push(best);
    greedy.push(tok.decode([best]));
  }

  return {
    model: MODELS.tinyLm,
    greedy,
    arch: { layers: 30, hidden: 576, heads: 9, vocab, params: '135M' },
    text,
    tokens: ids.map((id) => ({ id, t: tok.decode([id]) })),
    teacher,
  };
}

const sampling = await samplingData();
await inject('embedding-space.html', await embeddingData());
await inject('sampling-lab.html', sampling);
await inject('transformer-pipeline.html', { ...(await pipelineData()), next: sampling.prompts[0] });
