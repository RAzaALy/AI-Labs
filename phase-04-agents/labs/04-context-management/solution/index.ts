// Context management: every step re-sends the whole history, and long contexts are both expensive and worse
// ("context rot"). Two standard techniques: clear stale tool results, and keep durable notes OUTSIDE the context.
import { tool, type ModelMessage, type PrepareStepFunction, type ToolSet } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';

const enc = getEncoding('o200k_base');
export const estimateTokens = (messages: ModelMessage[]) => enc.encode(JSON.stringify(messages)).length;

/**
 * Replace the output of tool results older than the last `keepLast` STEPS with a short placeholder.
 * Count steps (tool messages), not results: one step can run several tools in parallel, and clearing
 * the results of the step the model is still reading makes it re-run the same searches.
 * The tool CALL stays (so the model remembers what it did), and the message structure stays valid.
 */
export function clearOldToolResults(messages: ModelMessage[], keepLast = 2): ModelMessage[] {
  const toolMsgs = messages.filter((m) => m.role === 'tool');
  const keep = new Set(toolMsgs.slice(-keepLast));
  return messages.map((m) => {
    if (m.role !== 'tool' || keep.has(m)) return m;
    return {
      ...m,
      content: m.content.map((p) => {
        if (p.type !== 'tool-result' || p.toolName === 'saveNote') return p;
        const size = enc.encode(JSON.stringify(p.output)).length;
        return { ...p, output: { type: 'text' as const, value: `[cleared: ${p.toolName} result (${size} tokens). Your notes hold what mattered; call the tool again if you need the details.]` } };
      }),
    };
  });
}

/** Structured note-taking: durable memory that survives clearing (and could survive the whole session). */
export function notesTools(store: string[]) {
  return {
    saveNote: tool({
      description: 'Save a short fact you will need later (e.g. a number and its source). Notes survive when old tool results are cleared.',
      inputSchema: z.object({ note: z.string().max(300) }),
      execute: async ({ note }) => {
        store.push(note);
        return { saved: store.length };
      },
    }),
    readNotes: tool({
      description: 'Read all notes saved so far.',
      inputSchema: z.object({}),
      execute: async () => ({ notes: store }),
    }),
  };
}

/**
 * prepareStep runs before every model call. When the history exceeds `budget` tokens, clear old tool results.
 * The returned messages REPLACE the history for this and later steps.
 */
export function compactingPrepareStep(budget: number, keepLast = 2): PrepareStepFunction<ToolSet> {
  return ({ messages }) => (estimateTokens(messages) > budget ? { messages: clearOldToolResults(messages, keepLast) } : {});
}

/**
 * Don't rely on the prompt for behaviour you depend on: after any step that searched, the next step may ONLY
 * save notes. prepareStep changes the active tools per step, which turns "please save notes" into a rule.
 */
export function notesAfterSearch(searchTool = 'search'): PrepareStepFunction<ToolSet> {
  return ({ steps }) => (steps.at(-1)?.toolCalls.some((c) => c.toolName === searchTool) ? { activeTools: ['saveNote'], toolChoice: 'required' } : {});
}

/** Run several prepareStep functions; later ones win on conflicting keys. */
export function combinePrepareSteps(...fns: PrepareStepFunction<ToolSet>[]): PrepareStepFunction<ToolSet> {
  return async (opts) => {
    let merged = {};
    for (const fn of fns) merged = { ...merged, ...((await fn(opts)) ?? {}) };
    return merged;
  };
}
