// A deterministic stand-in for an LLM so the app and its acceptance tests run with no API key.
// It behaves like a (very literal) grounded model: it finds the source sharing the most words with the
// question and quotes its best sentence with a citation, or answers "I don't know." when nothing overlaps.
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const STOP = new Set('a an the is are was be to of in on for and or how what when where which who why do does did i my we our it at by with can should if from this that about you your me its there their has have'.split(' '));
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter((w) => !STOP.has(w) && w.length > 2));

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

export function mockAnswer(promptText: string): string {
  const question = promptText.match(/Question:\s*([\s\S]*)$/)?.[1]?.trim() ?? '';
  const q = words(question);
  const sources = [...promptText.matchAll(/<source id="(\d+)"[^>]*>\n([\s\S]*?)\n<\/source>/g)].map((m) => ({ n: Number(m[1]), text: m[2]! }));
  let best: { n: number; sentence: string; score: number } | undefined;
  for (const s of sources) {
    for (const sentence of s.text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/^[-*|#>\s]+/, '').trim()).filter((x) => x.length > 20)) {
      const w = words(sentence);
      const score = [...q].filter((x) => w.has(x)).length;
      if (!best || score > best.score) best = { n: s.n, sentence, score };
    }
  }
  // Two or more shared content words, else refuse: crude, but it never invents anything.
  if (!best || best.score < 2) return "I don't know.";
  return `${best.sentence.replace(/[.!?]?$/, '')} [${best.n}].`;
}

export function groundedMockModel(): MockLanguageModelV4 {
  const textOf = (prompt: unknown) => JSON.stringify(prompt).replace(/\\n/g, '\n').replace(/\\"/g, '"');
  const tokens = (prompt: unknown) => Math.ceil(JSON.stringify(prompt).length / 4);
  const lastUser = (prompt: { role: string; content: unknown }[]) => {
    const m = prompt.filter((x) => x.role === 'user').at(-1);
    return Array.isArray(m?.content) ? m.content.map((p: { text?: string }) => p.text ?? '').join('') : String(m?.content ?? '');
  };
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const text = mockAnswer(lastUser(prompt as never) || textOf(prompt));
      return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage: usage(tokens(prompt), Math.ceil(text.length / 4)), warnings: [] };
    },
    doStream: async ({ prompt }) => {
      const text = mockAnswer(lastUser(prompt as never) || textOf(prompt));
      const chunks: unknown[] = [{ type: 'text-start', id: 't1' }];
      for (const piece of text.match(/\S+\s*/g) ?? []) chunks.push({ type: 'text-delta', id: 't1', delta: piece });
      chunks.push({ type: 'text-end', id: 't1' }, { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: usage(tokens(prompt), Math.ceil(text.length / 4)) });
      return { stream: simulateReadableStream({ chunks: chunks as never[], chunkDelayInMs: 10 }) };
    },
  });
}
