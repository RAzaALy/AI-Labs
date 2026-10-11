// Deterministic stand-ins for a real LLM, built on the AI SDK's MockLanguageModelV4.
// Labs use them so every check can run offline, in CI, and without spending quota.
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type V4Usage = {
  inputTokens: { total: number; noCache: number; cacheRead: number | undefined; cacheWrite: number | undefined };
  outputTokens: { total: number; text: number; reasoning: number | undefined };
};

export function usage(input: number, output: number, opts: { cacheRead?: number; reasoning?: number } = {}): V4Usage {
  return {
    inputTokens: { total: input, noCache: input - (opts.cacheRead ?? 0), cacheRead: opts.cacheRead, cacheWrite: undefined },
    outputTokens: { total: output + (opts.reasoning ?? 0), text: output, reasoning: opts.reasoning },
  };
}

/** One scripted model turn: plain text, or one/more tool calls. */
export type ScriptedTurn =
  | { text: string; usage?: V4Usage }
  | { toolCalls: { name: string; input: unknown }[]; usage?: V4Usage };

const approxTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

function promptText(prompt: unknown): string {
  return JSON.stringify(prompt);
}

/**
 * A model that plays back `turns` in order, one per call (the last one repeats).
 * Works for generateText AND streamText, so tool loops and streaming UIs can be tested offline.
 */
export function scriptedModel(turns: ScriptedTurn[], opts: { chunkDelayMs?: number } = {}): MockLanguageModelV4 {
  let i = 0;
  const next = () => turns[Math.min(i++, turns.length - 1)]!;
  let callId = 0;

  const content = (turn: ScriptedTurn) =>
    'text' in turn
      ? [{ type: 'text' as const, text: turn.text }]
      : turn.toolCalls.map((c) => ({ type: 'tool-call' as const, toolCallId: `call_${++callId}`, toolName: c.name, input: JSON.stringify(c.input) }));

  const finish = (turn: ScriptedTurn) => ({ unified: ('text' in turn ? 'stop' : 'tool-calls') as 'stop' | 'tool-calls', raw: undefined });

  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const turn = next();
      return {
        content: content(turn),
        finishReason: finish(turn),
        usage: turn.usage ?? usage(approxTokens(promptText(prompt)), 'text' in turn ? approxTokens(turn.text) : 20),
        warnings: [],
      };
    },
    doStream: async ({ prompt }) => {
      const turn = next();
      const chunks: unknown[] = [];
      if ('text' in turn) {
        chunks.push({ type: 'text-start', id: 't1' });
        for (const piece of turn.text.match(/\S+\s*/g) ?? [turn.text]) chunks.push({ type: 'text-delta', id: 't1', delta: piece });
        chunks.push({ type: 'text-end', id: 't1' });
      } else {
        for (const c of content(turn)) chunks.push(c);
      }
      chunks.push({
        type: 'finish',
        finishReason: finish(turn),
        usage: turn.usage ?? usage(approxTokens(promptText(prompt)), 'text' in turn ? approxTokens(turn.text) : 20),
      });
      return { stream: simulateReadableStream({ chunks: chunks as never[], chunkDelayInMs: opts.chunkDelayMs ?? 0 }) };
    },
  });
}

/** Default mock: answers "[mock] You said: <last user text>". */
export function echoMock(): MockLanguageModelV4 {
  const reply = (prompt: unknown) => {
    const all = promptText(prompt);
    const lastUser = [...all.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].at(-1)?.[1] ?? '';
    return `[mock] You said: ${lastUser.slice(0, 200)}`;
  };
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const text = reply(prompt);
      return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage: usage(approxTokens(promptText(prompt)), approxTokens(text)), warnings: [] };
    },
    doStream: async ({ prompt }) => {
      const text = reply(prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            ...(text.match(/\S+\s*/g) ?? []).map((delta) => ({ type: 'text-delta' as const, id: 't1', delta })),
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: usage(approxTokens(promptText(prompt)), approxTokens(text)) },
          ] as never[],
        }),
      };
    },
  });
}
