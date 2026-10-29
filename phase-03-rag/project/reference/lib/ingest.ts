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
  const existing = new Map((await sql<{ id: string; hash: string }[]>`SELECT id, hash FROM ${sql(docsTable)}`).map((r) => [r.id, r.hash]));
  const report: SyncReport = { added: [], updated: [], unchanged: 0, removed: [], chunks: 0 };

  for (const doc of docs) {
    const old = existing.get(doc.id);
    existing.delete(doc.id);
    if (old === doc.hash) {
      report.unchanged++;
      continue;
    }
    const chunks = chunkMarkdown(doc.id, doc.title, doc.body);
    // Embed BEFORE opening the transaction: a slow API call must not hold a database transaction open.
    const vectors = await embedder.embedDocuments(chunks.map((c) => c.embedText));
    await sql.begin(async (tx) => {
      // Replace the document's chunks atomically: searches never see a half-ingested document.
      await tx`DELETE FROM ${tx(docsTable)} WHERE id = ${doc.id}`; // cascades to its chunks
      await tx`INSERT INTO ${tx(docsTable)} (id, title, status, updated, hash) VALUES (${doc.id}, ${doc.title}, ${doc.status}, ${doc.updated}, ${doc.hash})`;
      for (const [i, c] of chunks.entries()) {
        await tx`INSERT INTO ${tx(chunksTable)} (id, doc_id, file, section, content, embedder, embedding)
                 VALUES (${c.id}, ${doc.id}, ${path.basename(doc.id)}, ${c.section}, ${c.text}, ${embedder.id}, ${toPgVector(vectors[i]!)}::vector)`;
      }
    });
    (old ? report.updated : report.added).push(doc.id);
    report.chunks += chunks.length;
    opts.log?.(`${old ? 'updated' : 'added  '} ${doc.id} (${chunks.length} chunks)`);
  }
  for (const id of existing.keys()) {
    await sql`DELETE FROM ${sql(docsTable)} WHERE id = ${id}`;
    report.removed.push(id);
    opts.log?.(`removed ${id}`);
  }
  return report;
}
