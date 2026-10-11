import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from 'ai';
import { z } from 'zod';
import { resolveModel } from '@/lib/model';
import { costUSD, worstCaseUSD } from '@/lib/pricing';
import { tools, UserFacingError } from '@/lib/tools';
import type { ChatMessage, MessageMetadata } from '@/lib/types';

export const maxDuration = 60;

const MAX_STEPS = 5;
const MAX_OUTPUT_TOKENS = 1000;
const INSTRUCTIONS = `You are Support Copilot for Acme Cloud.
- Use tools for facts: order data, currency conversion and company policies. Never guess them.
- If a tool returns an error, explain it plainly and ask a clarifying question.
- Answer in at most three short sentences unless the user asks for detail.`;

// Provided: request validation. Bad input → 400 before any tokens are spent.
const Body = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), parts: z.array(z.any()) }).passthrough()).min(1).max(100),
  tier: z.enum(['fast', 'smart']).default('fast'),
  budgetRemainingUSD: z.number().nonnegative().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request', issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const { messages, tier, budgetRemainingUSD } = parsed.data as { messages: ChatMessage[]; tier: 'fast' | 'smart'; budgetRemainingUSD?: number };
  const { model, modelId, provider } = resolveModel(tier);

  // TODO 1: modelMessages = await convertToModelMessages(messages, { tools })

  // TODO 2 (budget guard, AC6): estimate input tokens (~ (INSTRUCTIONS + JSON of modelMessages + 1200 for tool schemas) / 4),
  //   worst = worstCaseUSD(modelId, estimate, MAX_OUTPUT_TOKENS, MAX_STEPS).
  //   If budgetRemainingUSD is set and worst > budgetRemainingUSD → return Response.json({ error: 'budget', message }, { status: 402 })

  // TODO 3: result = streamText({ model, instructions: INSTRUCTIONS, messages: modelMessages, tools,
  //   stopWhen: isStepCount(MAX_STEPS), maxOutputTokens: MAX_OUTPUT_TOKENS, abortSignal: req.signal })

  // TODO 4: return createUIMessageStreamResponse({ stream: toUIMessageStream<typeof tools, ChatMessage>({
  //   stream: result.stream, originalMessages: messages,
  //   messageMetadata: ({ part }) => …  on 'start' → { modelId, provider, startedAt }
  //                                     on 'finish' → usage from part.totalUsage (summed over all steps) + costUSD(modelId, usage)
  //   onError: (error) => UserFacingError → its message; anything else → a generic message (never leak internals)
  // }) })

  void [convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, costUSD, worstCaseUSD, tools, UserFacingError, model, modelId, provider, budgetRemainingUSD, MAX_STEPS, MAX_OUTPUT_TOKENS, INSTRUCTIONS];
  const _meta: MessageMetadata = {};
  void _meta;
  return Response.json({ error: 'TODO: implement /api/chat' }, { status: 501 });
}
