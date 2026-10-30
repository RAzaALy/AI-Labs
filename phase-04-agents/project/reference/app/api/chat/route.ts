import { createAgentUIStreamResponse } from 'ai';
import { z } from 'zod';
import { createOpsAgent, MAX_STEPS, MAX_TOKENS } from '@/lib/agent';
import { agentModel } from '@/lib/model';
import { db, ensureReady, OpsStore, ToolError } from '@/lib/ops';
import type { MessageMetadata } from '@/lib/types';

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), parts: z.array(z.any()) }).passthrough()).min(1).max(100),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request' }, { status: 400 });
  const { messages } = parsed.data;
  const lastText = JSON.stringify(messages.at(-1)?.parts ?? []);
  if (lastText.length > 20_000) return Response.json({ error: 'message too long' }, { status: 413 });

  await ensureReady(db());
  // In a real app `actor` is the signed-in user; Phase 7 adds auth. Every audit row records it.
  const store = new OpsStore(db(), req.headers.get('x-demo-user') ?? 'demo-user');
  const { model, modelId } = agentModel();
  const agent = createOpsAgent(model, store);

  const startedAt = Date.now();
  let steps = 0;
  let pendingApproval = false;
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: req.signal,
    messageMetadata: ({ part }): MessageMetadata | undefined => {
      if (part.type === 'start') return { modelId, startedAt };
      if (part.type === 'finish-step') steps++;
      if (part.type === 'tool-approval-request' && !part.isAutomatic) pendingApproval = true;
      if (part.type === 'finish') {
        const used = (part.totalUsage.inputTokens ?? 0) + (part.totalUsage.outputTokens ?? 0);
        const stoppedBy = pendingApproval ? 'awaiting-approval' : used >= MAX_TOKENS ? 'budget' : steps >= MAX_STEPS && part.finishReason === 'tool-calls' ? 'max-steps' : 'answered';
        return { modelId, startedAt, finishedAt: Date.now(), steps, inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0, stoppedBy };
      }
    },
    // onError also shapes TOOL errors in the UI stream, and that text is what the model sees on the next turn.
    // Policy errors are written for the model and the user: pass them through. Everything else stays generic.
    onError: (error) => {
      if (error instanceof ToolError) return error.message;
      const msg = error instanceof Error ? error.message : String(error);
      if (/ECONNREFUSED/.test(msg)) return 'The database is not reachable. Start it with npm run db:up.';
      if (/rate|quota|429|overload|503/i.test(msg)) return 'The model is busy right now. Please retry in a moment.';
      if (/signature|approval/i.test(msg)) return 'That approval could not be verified, so nothing was executed.';
      console.error(error);
      return 'Something went wrong while running the agent.';
    },
  });
}
