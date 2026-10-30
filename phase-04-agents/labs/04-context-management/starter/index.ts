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
  // Keep the last `keepLast` tool MESSAGES (= steps) intact. In older tool messages, replace each tool-result output
  // with { type: "text", value: "[cleared: <toolName> result (<n> tokens) ...]" }, except saveNote results.
  // Keep every message (each tool call needs its result) and return new objects: do not mutate the input.
  throw new Error('TODO: clearOldToolResults');
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
  // Return ({ messages }) => estimateTokens(messages) > budget ? { messages: clearOldToolResults(messages, keepLast) } : {}
  throw new Error('TODO: compactingPrepareStep');
}

/**
 * Don't rely on the prompt for behaviour you depend on: after any step that searched, the next step may ONLY
 * save notes. prepareStep changes the active tools per step, which turns "please save notes" into a rule.
 */
export function notesAfterSearch(searchTool = 'search'): PrepareStepFunction<ToolSet> {
  // If the previous step (steps.at(-1)) called searchTool → { activeTools: ["saveNote"], toolChoice: "required" }, else {}.
  throw new Error('TODO: notesAfterSearch');
}

/** Run several prepareStep functions; later ones win on conflicting keys. */
export function combinePrepareSteps(...fns: PrepareStepFunction<ToolSet>[]): PrepareStepFunction<ToolSet> {
  // Return an async prepareStep that awaits each fn in order and merges their results ({ ...a, ...b }).
  throw new Error('TODO: combinePrepareSteps');
}
