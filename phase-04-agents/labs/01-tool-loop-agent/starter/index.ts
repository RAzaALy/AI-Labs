// An agent = a model in a loop, choosing tools until a stop condition fires.
// The interesting engineering is not the loop (the SDK runs it); it's the STOP conditions and the TRACE.
import { hasToolCall, isStepCount, ToolLoopAgent, tool, type LanguageModel, type StopCondition, type ToolSet } from 'ai';
import { z } from 'zod';
import { AcmeOps } from '../../../env/acme-ops.ts';
import { acmeTools } from '../../../env/tools.ts';

export const INSTRUCTIONS = `You are Acme's operations agent. You act through tools; you never invent data.
- Look things up before acting: check the handbook for policy and the systems for facts.
- If a tool returns an error, read it and fix your next call.
- When the task is complete (or cannot be completed), call done with a short summary of what you did.`;

/** The agent signals it is finished by calling `done`, which gives us a structured final report. */
export const doneTool = tool({
  description: 'Call exactly once when the task is complete or cannot be completed.',
  inputSchema: z.object({
    summary: z.string().describe('What you found and did, in 1-3 sentences'),
    outcome: z.enum(['resolved', 'escalated', 'not_possible']),
  }),
  execute: async () => ({ acknowledged: true }),
});

/**
 * A custom stop condition: stop once the run has used `maxTokens` (input + output, summed over steps).
 * Every step re-sends the whole conversation, so tokens grow much faster than steps.
 */
export function tokenBudget(maxTokens: number): StopCondition<ToolSet> {
  // Return a StopCondition: ({ steps }) => boolean.
  // Sum (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) over all steps; stop when the sum >= maxTokens.
  throw new Error('TODO: tokenBudget');
}

export function createOpsAgent(ops: AcmeOps, model: LanguageModel, opts: { maxSteps?: number; maxTokens?: number } = {}) {
  // new ToolLoopAgent({ model, instructions: INSTRUCTIONS, tools: { ...acmeTools(ops), done: doneTool },
  //   stopWhen: [hasToolCall('done'), isStepCount(opts.maxSteps ?? 10), tokenBudget(opts.maxTokens ?? 60_000)], temperature: 0 })
  throw new Error('TODO: createOpsAgent');
}

export interface TraceStep {
  step: number;
  inputTokens: number;
  outputTokens: number;
  calls: { tool: string; input: unknown; error?: string }[];
  text: string;
}
export interface RunResult {
  trace: TraceStep[];
  stoppedBy: 'done' | 'max-steps' | 'budget' | 'answered';
  report?: { summary: string; outcome: string };
  totalTokens: number;
}

export async function runTask(agent: ReturnType<typeof createOpsAgent>, task: string, opts: { maxSteps?: number; maxTokens?: number } = {}): Promise<RunResult> {
  // r = await agent.generate({ prompt: task })
  // trace: one TraceStep per r.steps entry: usage tokens, toolCalls (name + input), and the matching tool-error (find it in s.content by toolCallId).
  // stoppedBy: "done" if the last step called done; "budget" if total tokens >= maxTokens; "max-steps" if steps hit maxSteps while still calling tools; else "answered".
  // report = the done call's input.
  throw new Error('TODO: runTask');
}
