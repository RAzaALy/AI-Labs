// Structure-aware chunking (Lab 01): H2 sections → blocks (fences/tables kept whole) → ≤ maxTokens.
import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('o200k_base');
export const countTokens = (s: string) => enc.encode(s).length;

export interface Chunk {
  id: string; // `${docId}#${index}`
  section: string;
  text: string;
  embedText: string; // "Title > Section" header + text: chunks embedded out of context retrieve badly
}

function splitBlocks(md: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (line.trim().startsWith('```')) inFence = !inFence;
    if (!inFence && line.trim() === '') {
      if (cur.length) blocks.push(cur.join('\n'));
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks.map((b) => b.trim()).filter(Boolean);
}

function fixedWindows(text: string, max: number): string[] {
  const ids = enc.encode(text);
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += max) out.push(enc.decode(ids.slice(i, i + max)));
  return out;
}

function pack(pieces: string[], max: number, joiner: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (countTokens(piece) > max) {
      if (cur) out.push(cur), (cur = '');
      const byLines = piece.includes('\n');
      const parts = byLines ? piece.split('\n') : (piece.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [piece]).map((s) => s.trim());
      out.push(...(parts.length > 1 ? pack(parts, max, byLines ? '\n' : ' ') : fixedWindows(piece, max)));
      continue;
    }
    const candidate = cur ? cur + joiner + piece : piece;
    if (countTokens(candidate) > max) out.push(cur), (cur = piece);
    else cur = candidate;
  }
  if (cur) out.push(cur);
  return out;
}

export function chunkMarkdown(docId: string, title: string, body: string, maxTokens = 200): Chunk[] {
  // HTML comments are invisible to readers and very visible to an LLM: a classic prompt-injection hiding place.
  const clean = body.replace(/<!--[\s\S]*?-->/g, '');
  const sections: { section: string; body: string }[] = [{ section: '', body: '' }];
  let inFence = false;
  for (const line of clean.split('\n')) {
    if (line.trim().startsWith('```')) inFence = !inFence;
    const h2 = !inFence && line.match(/^##\s+(.+)$/);
    if (h2) sections.push({ section: h2[1]!.trim(), body: '' });
    else if (inFence || !/^#\s/.test(line)) sections.at(-1)!.body += line + '\n';
  }
  const chunks: Chunk[] = [];
  for (const s of sections) {
    for (const text of pack(splitBlocks(s.body), maxTokens, '\n\n')) {
      chunks.push({ id: `${docId}#${chunks.length}`, section: s.section, text, embedText: `${[title, s.section].filter(Boolean).join(' > ')}\n\n${text}` });
    }
  }
  return chunks;
}
