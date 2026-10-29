// Loads a folder of markdown documents (with simple YAML-style frontmatter) into memory.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Doc {
  id: string; // relative path, e.g. "archive/refund-policy-2024.md"
  file: string; // basename, e.g. "refund-policy-2024.md"
  title: string;
  meta: Record<string, string>;
  body: string; // markdown without frontmatter
  hash: string; // sha256 of the full file: lets ingestion skip unchanged docs
}

export const ACME_CORPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../phase-03-rag/corpus/acme-handbook');

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

export async function loadCorpus(dir = ACME_CORPUS): Promise<Doc[]> {
  const docs: Doc[] = [];
  async function walk(d: string) {
    for (const entry of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.name.endsWith('.md')) {
        const raw = await readFile(p, 'utf8');
        const { meta, body } = parseFrontmatter(raw);
        docs.push({
          id: path.relative(dir, p),
          file: entry.name,
          title: meta.title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? entry.name,
          meta,
          body,
          hash: createHash('sha256').update(raw).digest('hex'),
        });
      }
    }
  }
  await walk(dir);
  return docs;
}

export interface GoldenQuestion {
  id: string;
  type: 'paraphrase' | 'keyword' | 'numeric' | 'conflict' | 'unanswerable';
  query: string;
  relevant: { file: string; section: string }[];
  answer_contains?: string[];
  answer_must_not_contain?: string[];
}

export async function loadGoldenSet(): Promise<GoldenQuestion[]> {
  const p = path.join(ACME_CORPUS, '..', 'golden-set.json');
  return JSON.parse(await readFile(p, 'utf8')).questions;
}
