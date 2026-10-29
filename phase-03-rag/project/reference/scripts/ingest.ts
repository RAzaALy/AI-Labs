// Usage: npm run ingest [-- --dir path/to/markdown]   (re-run any time: unchanged documents are skipped)
import { parseArgs } from 'node:util';
import { DEFAULT_CORPUS } from './env';
import { db } from '../lib/db';
import { getEmbedder } from '../lib/embeddings';
import { syncFolder } from '../lib/ingest';

const { values } = parseArgs({ options: { dir: { type: 'string', default: process.env.DOCS_DIR ?? DEFAULT_CORPUS } } });
const sql = db();
const embedder = getEmbedder();
const started = Date.now();
try {
  console.log(`Syncing ${values.dir} → Postgres (embedder: ${embedder.id})`);
  const r = await syncFolder(sql, embedder, values.dir!, { log: (s) => console.log('  ' + s) });
  console.log(`\nadded ${r.added.length} · updated ${r.updated.length} · unchanged ${r.unchanged} · removed ${r.removed.length} · ${r.chunks} chunks embedded · ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(/ECONNREFUSED/.test(msg) ? 'Postgres is not reachable. Start it with: npm run db:up (from the repo root)' : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
