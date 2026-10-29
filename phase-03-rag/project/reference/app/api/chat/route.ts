import { createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream, type ToolSet } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getEmbedder } from '@/lib/embeddings';
import { hybridSearch } from '@/lib/retrieve';
import { buildPrompt, checkAnswer, INSTRUCTIONS, toSources } from '@/lib/answer';
import { chatModel } from '@/lib/model';
import type { ChatMessage, MessageMetadata } from '@/lib/types';

export const maxDuration = 60;

const Body = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), parts: z.array(z.any()) }).passthrough()).min(1).max(100),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request' }, { status: 400 });
  const messages = parsed.data.messages as ChatMessage[];
  const last = messages.at(-1)!;
  const question = last.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join(' ').trim();
  if (last.role !== 'user' || !question) return Response.json({ error: 'the last message must be a user question' }, { status: 400 });
  if (question.length > 2000) return Response.json({ error: 'question too long (max 2000 characters)' }, { status: 413 });

  const embedder = getEmbedder();
  const { model, modelId } = chatModel();
  const startedAt = Date.now();

  const stream = createUIMessageStream<ChatMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // 1. Retrieve. Each turn is answered from fresh retrieval over the latest question only
      //    (follow-ups like "and for Pro?" need query rewriting: a stretch goal).
      const sources = toSources(await hybridSearch(db(), embedder, question, 5));
      const retrievalMs = Date.now() - startedAt;
      // 2. Send the sources first, so the UI can show them while the answer streams.
      writer.write({ type: 'data-sources', data: sources });

      // 3. Generate, grounded in those sources only. History is not sent to the model: every answer
      //    must be supported by the sources retrieved for THIS question.
      const result = streamText({ model, instructions: INSTRUCTIONS, prompt: buildPrompt(question, sources), temperature: 0, maxOutputTokens: 400, abortSignal: req.signal });

      let text = '';
      writer.merge(
        toUIMessageStream<ToolSet, ChatMessage>({
          stream: result.stream,
          messageMetadata: ({ part }): MessageMetadata | undefined => {
            if (part.type === 'text-delta') text += part.text;
            if (part.type === 'start') return { modelId, embedder: embedder.id, retrievalMs, startedAt };
            // 4. After the stream: validate citations and detect "I don't know".
            if (part.type === 'finish')
              return { ...checkAnswer(text, sources), finishedAt: Date.now(), inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 };
          },
        }),
      );
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (/ECONNREFUSED|does not exist|relation .* does not exist/i.test(msg)) return 'The document index is not available. Start Postgres (npm run db:up) and run npm run ingest.';
      if (/rate|quota|429|overload|503/i.test(msg)) return 'The model is busy right now. Please retry in a moment.';
      console.error(error);
      return 'Something went wrong answering this question.';
    },
  });
  return createUIMessageStreamResponse({ stream });
}
