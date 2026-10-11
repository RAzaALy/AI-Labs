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

const Body = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), parts: z.array(z.any()) }).passthrough()).min(1).max(100),
  tier: z.enum(['fast', 'smart']).default('fast'),
  /** What is left of this chat session's budget, tracked client-side (Phase 7 moves this server-side per user). */
  budgetRemainingUSD: z.number().nonnegative().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request', issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const { messages, tier, budgetRemainingUSD } = parsed.data as { messages: ChatMessage[]; tier: 'fast' | 'smart'; budgetRemainingUSD?: number };

  const { model, modelId, provider } = resolveModel(tier);
  const modelMessages = await convertToModelMessages(messages, { tools });

  // Pre-flight budget guard: refuse BEFORE spending, using a worst-case estimate (≈4 chars/token).
  const estimatedInput = Math.ceil((INSTRUCTIONS.length + JSON.stringify(modelMessages).length + 1200) / 4);
  const worst = worstCaseUSD(modelId, estimatedInput, MAX_OUTPUT_TOKENS, MAX_STEPS);
  if (budgetRemainingUSD !== undefined && worst > budgetRemainingUSD) {
    return Response.json({ error: 'budget', message: `This request could cost up to $${worst.toFixed(5)}, but only $${budgetRemainingUSD.toFixed(5)} of the session budget is left.` }, { status: 402 });
  }

  const startedAt = Date.now();
  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal, // user pressed Stop / closed the tab → stop generating (and paying)
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, ChatMessage>({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }): MessageMetadata | undefined => {
        if (part.type === 'start') return { modelId, provider, startedAt };
        if (part.type === 'finish') {
          const u = part.totalUsage; // summed over ALL steps of the tool loop
          return {
            modelId,
            provider,
            startedAt,
            finishedAt: Date.now(),
            inputTokens: u.inputTokens ?? 0,
            outputTokens: u.outputTokens ?? 0,
            reasoningTokens: u.outputTokenDetails?.reasoningTokens ?? 0,
            cachedInputTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
            costUSD: costUSD(modelId, u),
          };
        }
      },
      // Only messages we explicitly marked as safe reach the browser; never leak provider or stack internals.
      onError: (error) => {
        if (error instanceof UserFacingError) return error.message;
        if (error instanceof Error && /rate|quota|429|overload|503/i.test(error.message)) return 'The model is busy right now. Please retry in a moment.';
        console.error(error);
        return 'Something went wrong generating this answer.';
      },
    }),
  });
}
