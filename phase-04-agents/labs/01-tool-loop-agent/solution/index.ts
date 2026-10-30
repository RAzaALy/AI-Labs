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
  return ({ steps }) => steps.reduce((s, st) => s + (st.usage.inputTokens ?? 0) + (st.usage.outputTokens ?? 0), 0) >= maxTokens;
}

export function createOpsAgent(ops: AcmeOps, model: LanguageModel, opts: { maxSteps?: number; maxTokens?: number } = {}) {
  return new ToolLoopAgent({
    model,
    instructions: INSTRUCTIONS,
    tools: { ...acmeTools(ops), done: doneTool },
    // Whichever fires first: the agent says it's done, it runs out of steps, or it runs out of budget.
    stopWhen: [hasToolCall('done'), isStepCount(opts.maxSteps ?? 10), tokenBudget(opts.maxTokens ?? 60_000)],
    temperature: 0,
  });
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
  const r = await agent.generate({ prompt: task });
  const trace: TraceStep[] = r.steps.map((s, i) => ({
    step: i + 1,
    inputTokens: s.usage.inputTokens ?? 0,
    outputTokens: s.usage.outputTokens ?? 0,
    // Errors are part of the trace: a step whose tool failed is a step the agent had to recover from.
    calls: s.toolCalls.map((c) => {
      const err = s.content.find((p) => p.type === 'tool-error' && p.toolCallId === c.toolCallId);
      return { tool: c.toolName, input: c.input, ...(err && err.type === 'tool-error' ? { error: String((err.error as Error)?.message ?? err.error) } : {}) };
    }),
    text: s.text,
  }));
  const totalTokens = trace.reduce((s, t) => s + t.inputTokens + t.outputTokens, 0);
  const doneCall = r.steps.at(-1)?.toolCalls.find((c) => c.toolName === 'done');
  const stoppedBy = doneCall ? 'done' : totalTokens >= (opts.maxTokens ?? 60_000) ? 'budget' : r.steps.length >= (opts.maxSteps ?? 10) && r.steps.at(-1)!.toolCalls.length > 0 ? 'max-steps' : 'answered';
  return { trace, stoppedBy, report: doneCall?.input as RunResult['report'], totalTokens };
}
