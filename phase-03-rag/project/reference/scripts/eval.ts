// Usage: npm run eval [-- --answers] [--min-recall 0.9] [--min-mrr 0.75] [--min-accuracy 0.8]
// Retrieval metrics on the golden set (no LLM), plus answer checks with --answers. Exits 1 below thresholds,
// so CI can block a change (new chunk size, new embedder, new prompt) that makes the assistant worse.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { generateText } from 'ai';
import { repoRoot } from './env';
import { db } from '../lib/db';
import { getEmbedder } from '../lib/embeddings';
import { hybridSearch } from '../lib/retrieve';
import { buildPrompt, checkAnswer, INSTRUCTIONS, toSources } from '../lib/answer';
import { chatModel } from '../lib/model';

const { values } = parseArgs({
  options: {
    answers: { type: 'boolean', default: false },
    'min-recall': { type: 'string', default: '0.9' },
    'min-mrr': { type: 'string', default: '0.75' },
    'min-accuracy': { type: 'string', default: '0.8' },
    k: { type: 'string', default: '5' },
  },
});
const k = Number(values.k);

interface Golden {
  id: string;
  type: string;
  query: string;
  relevant: { file: string; section: string }[];
  answer_contains?: string[];
  answer_must_not_contain?: string[];
}
const golden: Golden[] = JSON.parse(await readFile(path.join(repoRoot, 'phase-03-rag/corpus/golden-set.json'), 'utf8')).questions;

const key = (r: { file: string; section: string }) => `${r.file}::${r.section}`;
const sql = db();
const embedder = getEmbedder();
const { model, modelId } = chatModel();

let recall = 0, rr = 0, retrievalCount = 0, correct = 0;
const failures: string[] = [];
try {
  for (const q of golden) {
    const hits = await hybridSearch(sql, embedder, q.query, k);
    if (q.relevant.length) {
      // Labels are per section: collapse chunks to unique sections before scoring.
      const ranked = [...new Set(hits.map(key))];
      const rel = new Set(q.relevant.map(key));
      const r = q.relevant.filter((x) => ranked.includes(key(x))).length / q.relevant.length;
      const first = ranked.findIndex((x) => rel.has(x));
      recall += r;
      rr += first < 0 ? 0 : 1 / (first + 1);
      retrievalCount++;
      if (r < 1) failures.push(`retrieval ${q.id} "${q.query}" missed ${q.relevant.map(key).join(', ')}`);
    }
    if (values.answers) {
      const sources = toSources(hits);
      const { text } = await generateText({ model, instructions: INSTRUCTIONS, prompt: buildPrompt(q.query, sources), temperature: 0, maxRetries: 4 });
      const check = checkAnswer(text, sources);
      const lower = text.toLowerCase();
      const ok =
        q.type === 'unanswerable'
          ? !check.answerable
          : check.answerable &&
            check.problems.length === 0 &&
            (q.answer_contains ?? []).every((s) => lower.includes(s.toLowerCase())) &&
            (q.answer_must_not_contain ?? []).every((s) => !lower.includes(s.toLowerCase()));
      if (ok) correct++;
      else failures.push(`answer    ${q.id} "${q.query}" → ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
      process.stdout.write(ok ? '.' : 'x');
    }
  }
} finally {
  await sql.end();
}

const metrics = { [`recall@${k}`]: recall / retrievalCount, mrr: rr / retrievalCount, ...(values.answers ? { accuracy: correct / golden.length } : {}) };
const thresholds: Record<string, number> = { [`recall@${k}`]: Number(values['min-recall']), mrr: Number(values['min-mrr']), accuracy: Number(values['min-accuracy']) };
console.log(`\n\nGolden set: ${golden.length} questions · embedder ${embedder.id}${values.answers ? ` · model ${modelId}` : ''}\n`);
let pass = true;
for (const [name, value] of Object.entries(metrics)) {
  const ok = value >= thresholds[name]!;
  pass &&= ok;
  console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(9)} ${value.toFixed(3)}  (min ${thresholds[name]})`);
}
if (failures.length) console.log(`\nFailures:\n  ${failures.join('\n  ')}`);
console.log(`\nJSON ${JSON.stringify(metrics)}`);
if (!pass) process.exitCode = 1;
