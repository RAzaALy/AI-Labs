// Ingestion as a SYNC, not a one-off load: re-running it only touches documents whose content changed,
// and removes documents that disappeared from the folder. Content hashes make it idempotent.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chunkMarkdown } from './chunk';
import { ensureSchema, tables, type Sql } from './db';
import { toPgVector, type Embedder } from './embeddings';

export interface SourceDoc {
  id: string; // path relative to the corpus folder
  title: string;
  status: string; // 'current' | 'deprecated' (frontmatter)
  updated: string | null;
  body: string;
  hash: string;
}

export function parseDoc(id: string, raw: string): SourceDoc {
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  for (const line of fm?.[1]?.split('\n') ?? []) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  const body = fm ? raw.slice(fm[0].length) : raw;
  return {
    id,
    title: meta.title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(id),
    status: meta.status ?? 'current',
    updated: meta.updated ?? null,
    body,
    hash: createHash('sha256').update(raw).digest('hex'),
  };
}

export async function readFolder(dir: string): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const full = path.join(entry.parentPath, entry.name);
    docs.push(parseDoc(path.relative(dir, full), await readFile(full, 'utf8')));
  }
  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

export interface SyncReport {
  added: string[];
  updated: string[];
  unchanged: number;
  removed: string[];
  chunks: number; // chunks embedded in this run
}

export async function syncFolder(sql: Sql, embedder: Embedder, dir: string, opts: { log?: (s: string) => void } = {}): Promise<SyncReport> {
  const { docs: docsTable, chunks: chunksTable } = tables(embedder.dims);
  await ensureSchema(sql, embedder.dims);
  const docs = await readFolder(dir);
  const report: SyncReport = { added: [], updated: [], unchanged: 0, removed: [], chunks: 0 };
  // TODO 1 (AC1): load the stored hashes: SELECT id, hash FROM ${sql(docsTable)} → Map<id, hash>.
  // TODO 2: for each doc:
  //   - same hash as stored → report.unchanged++ and skip (no embedding calls!)
  //   - else chunkMarkdown(doc.id, doc.title, doc.body), embed c.embedText with embedder.embedDocuments
  //     (BEFORE the transaction: never hold a DB transaction open during a slow API call),
  //     then in sql.begin(tx => ...): delete the doc row (cascades to its chunks), insert the doc
  //     (id, title, status, updated, hash) and every chunk into chunksTable
  //     (id, doc_id, file = path.basename(doc.id), section, content = c.text, embedder = embedder.id, embedding = toPgVector(v)::vector).
  //   - push the id to report.added or report.updated; add the chunk count to report.chunks; opts.log?.(...)
  // TODO 3: stored docs that are no longer in the folder → DELETE them, push to report.removed.
  void [docs, chunksTable, chunkMarkdown, toPgVector];
  throw new Error('TODO: syncFolder');
  return report;
}
