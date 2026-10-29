// Chunking: how you cut documents decides what retrieval can ever find.
import { getEncoding } from 'js-tiktoken';
import type { Doc } from '../../../../shared/corpus.ts';

const enc = getEncoding('o200k_base');
export const countTokens = (s: string) => enc.encode(s).length;

export interface Chunk {
  id: string; // `${docId}#${index}`
  docId: string;
  file: string;
  title: string;
  section: string; // nearest H2 heading ('' for text before the first H2)
  headingPath: string[]; // e.g. ["Deploys and rollbacks", "Rolling back a bad release"]
  text: string; // the chunk content
  /** What we actually embed: a short context header + text. Embedding chunks out of context is a classic miss. */
  embedText: string;
  tokens: number;
  index: number;
}

// ---------- 1. Naive baseline: fixed token windows with overlap ----------
export function fixedSizeChunks(text: string, maxTokens: number, overlap: number): string[] {
  if (overlap >= maxTokens) throw new Error('overlap must be smaller than maxTokens');
  const ids = enc.encode(text);
  const out: string[] = [];
  for (let start = 0; start < ids.length; start += maxTokens - overlap) {
    out.push(enc.decode(ids.slice(start, start + maxTokens)));
    if (start + maxTokens >= ids.length) break;
  }
  return out;
}

// ---------- 2. Structure-aware: markdown sections → paragraphs → sentences ----------

/** Split markdown into blocks, keeping fenced code blocks and tables intact. */
export function splitBlocks(md: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (line.trim().startsWith('```')) inFence = !inFence;
    if (!inFence && line.trim() === '') {
      if (current.length) blocks.push(current.join('\n'));
      current = [];
    } else current.push(line);
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

function splitSentences(block: string): string[] {
  return block.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [block];
}

/** Pack pieces greedily into chunks of at most maxTokens; pieces bigger than the limit get split further. */
function pack(pieces: string[], maxTokens: number, joiner: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (countTokens(piece) > maxTokens) {
      if (cur) out.push(cur), (cur = '');
      // Too big: split by lines (keeps table rows whole), else by sentences. If that makes no progress
      // (one long line with no sentence breaks), fall back to fixed windows; otherwise we'd recurse forever.
      const byLines = piece.includes('\n');
      const parts = byLines ? piece.split('\n') : splitSentences(piece);
      out.push(...(parts.length > 1 ? pack(parts, maxTokens, byLines ? '\n' : ' ') : fixedSizeChunks(piece, maxTokens, 0)));
      continue;
    }
    const candidate = cur ? cur + joiner + piece : piece;
    if (countTokens(candidate) > maxTokens) {
      out.push(cur);
      cur = piece;
    } else cur = candidate;
  }
  if (cur) out.push(cur);
  return out;
}

export interface Section {
  headingPath: string[];
  section: string;
  body: string;
}

/** Split a document into H2 sections (H1 = document title, H3+ stay inside their H2). */
export function splitSections(doc: Doc): Section[] {
  const sections: Section[] = [];
  let current: Section = { headingPath: [doc.title], section: '', body: '' };
  let inFence = false;
  for (const line of doc.body.split('\n')) {
    if (line.trim().startsWith('```')) inFence = !inFence;
    const h2 = !inFence && line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current.body.trim()) sections.push(current);
      current = { headingPath: [doc.title, h2[1]!.trim()], section: h2[1]!.trim(), body: '' };
    } else if (!inFence && /^#\s/.test(line)) {
      // H1 title: skip (it is already in headingPath)
    } else current.body += line + '\n';
  }
  if (current.body.trim()) sections.push(current);
  return sections;
}

/** Remove HTML comments: invisible to readers, very visible to an LLM (a common prompt-injection hiding place). */
export const stripHtmlComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');

export function markdownChunks(doc: Doc, maxTokens = 200): Chunk[] {
  const chunks: Chunk[] = [];
  for (const sec of splitSections(doc)) {
    const blocks = splitBlocks(stripHtmlComments(sec.body)).map((b) => b.trim()).filter(Boolean);
    for (const text of pack(blocks, maxTokens, '\n\n')) {
      const index = chunks.length;
      const header = sec.headingPath.join(' > ');
      chunks.push({
        id: `${doc.id}#${index}`,
        docId: doc.id,
        file: doc.file,
        title: doc.title,
        section: sec.section,
        headingPath: sec.headingPath,
        text,
        embedText: `${header}\n\n${text}`,
        tokens: countTokens(text),
        index,
      });
    }
  }
  return chunks;
}

/** Chunk a whole corpus and report simple statistics, the numbers you look at when tuning chunk size. */
export function chunkCorpus(docs: Doc[], maxTokens = 200) {
  const chunks = docs.flatMap((d) => markdownChunks(d, maxTokens));
  const sizes = chunks.map((c) => c.tokens).sort((a, b) => a - b);
  return {
    chunks,
    stats: { count: chunks.length, minTokens: sizes[0] ?? 0, medianTokens: sizes[Math.floor(sizes.length / 2)] ?? 0, maxTokens: sizes.at(-1) ?? 0 },
  };
}
