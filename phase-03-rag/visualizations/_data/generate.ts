// Bakes REAL retrieval results into the Phase 3 visualizations (single-file HTML, works offline).
// Usage: npm run db:up && LLM_PROVIDER=mock npx tsx phase-03-rag/visualizations/_data/generate.ts
// Uses the local MiniLM embedder so the data is reproducible without a key.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadCorpus, loadGoldenSet } from '../../../shared/corpus.ts';
import { connectOrExplain } from '../../../shared/db.ts';
import { cachedEmbedder, localEmbedder } from '../../../shared/embeddings.ts';
import { chunkCorpus } from '../../labs/01-chunking/solution/index.ts';
import { createSchema, indexChunks, vectorSearch } from '../../labs/02-pgvector/solution/index.ts';
import { addFullTextSearch, keywordSearch } from '../../labs/03-hybrid-search/solution/index.ts';

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

const sql = await connectOrExplain();
const embedder = cachedEmbedder(localEmbedder());
const docs = await loadCorpus();
const TABLE = 'viz_chunks';
await createSchema(sql, embedder.dims, TABLE);
await indexChunks(sql, chunkCorpus(docs, 200).chunks, docs, embedder, TABLE);
await addFullTextSearch(sql, TABLE);

const golden = await loadGoldenSet();
const pick = ['q05', 'q06', 'q01', 'q26', 'q16', 'q17', 'q12', 'q32'];
const queries = [];
for (const id of pick) {
  const q = golden.find((g) => g.id === id)!;
  const strip = (h: { file: string; section: string; score: number }) => ({ file: h.file, section: h.section || '(intro)', score: Math.round(h.score * 1000) / 1000 });
  queries.push({
    id,
    type: q.type,
    query: q.query,
    relevant: q.relevant.map((r) => `${r.file}::${r.section}`),
    keyword: (await keywordSearch(sql, q.query, 10, { table: TABLE })).map(strip),
    vector: (await vectorSearch(sql, embedder, q.query, 10, { table: TABLE })).map(strip),
  });
}
await inject('hybrid-rrf.html', { embedder: embedder.id, queries });

const deploy = docs.find((d) => d.file === 'deploys-and-rollbacks.md')!;
const api = docs.find((d) => d.file === 'api-errors.md')!;
const webhooks = docs.find((d) => d.file === 'webhooks.md')!;
await inject('chunking-playground.html', { presets: [deploy, api, webhooks].map((d) => ({ file: d.file, title: d.title, body: d.body })) });
await sql.end();
