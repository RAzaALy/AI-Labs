import { createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream, type ToolSet } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getEmbedder } from '@/lib/embeddings';
import { hybridSearch } from '@/lib/retrieve';
import { buildPrompt, checkAnswer, INSTRUCTIONS, toSources } from '@/lib/answer';
import { chatModel } from '@/lib/model';
import type { ChatMessage } from '@/lib/types';

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
      // TODO 1: sources = toSources(await hybridSearch(db(), embedder, question, 5)); retrievalMs = Date.now() - startedAt
      // TODO 2 (AC4): writer.write({ type: 'data-sources', data: sources }) BEFORE generating, so the UI shows them immediately
      // TODO 3: result = streamText({ model, instructions: INSTRUCTIONS, prompt: buildPrompt(question, sources), temperature: 0,
      //         maxOutputTokens: 400, abortSignal: req.signal })
      // TODO 4: writer.merge(toUIMessageStream<ToolSet, ChatMessage>({ stream: result.stream, messageMetadata: ({ part }) => ... }))
      //   - accumulate the answer from 'text-delta' parts (part.text)
      //   - on 'start': { modelId, embedder: embedder.id, retrievalMs, startedAt }
      //   - on 'finish': { ...checkAnswer(text, sources), finishedAt: Date.now(), inputTokens, outputTokens (part.totalUsage) }
      void [writer, model, modelId, embedder, db, hybridSearch, toSources, buildPrompt, checkAnswer, INSTRUCTIONS, streamText, toUIMessageStream];
      throw new Error('TODO: implement the RAG chat pipeline');
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (/ECONNREFUSED|does not exist/i.test(msg)) return 'The document index is not available. Start Postgres (npm run db:up) and run npm run ingest.';
      if (/rate|quota|429|overload|503/i.test(msg)) return 'The model is busy right now. Please retry in a moment.';
      console.error(error);
      return msg.startsWith('TODO') ? msg : 'Something went wrong answering this question.';
    },
  });
  return createUIMessageStreamResponse({ stream });
}
