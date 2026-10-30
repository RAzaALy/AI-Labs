import { createAgentUIStreamResponse } from 'ai';
import { z } from 'zod';
import { createOpsAgent, MAX_STEPS, MAX_TOKENS } from '@/lib/agent';
import { agentModel } from '@/lib/model';
import { db, ensureReady, OpsStore, ToolError } from '@/lib/ops';

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

  // TODO (AC2–AC9): return createAgentUIStreamResponse({ agent, uiMessages: messages, abortSignal: req.signal,
  //   messageMetadata: ({ part }) => ...  on 'start': { modelId, startedAt }; count 'finish-step' parts;
  //     note non-automatic 'tool-approval-request' parts; on 'finish': { steps, inputTokens, outputTokens, finishedAt,
  //     stoppedBy: 'awaiting-approval' | 'budget' | 'max-steps' | 'answered' }
  //   onError: ToolError → its message (the model reads it next turn!); ECONNREFUSED / rate limits → friendly text;
  //     anything else → a generic message (log it) })
  void [agent, createAgentUIStreamResponse, MAX_STEPS, MAX_TOKENS, ToolError];
  return Response.json({ error: 'TODO: implement /api/chat' }, { status: 501 });
}
