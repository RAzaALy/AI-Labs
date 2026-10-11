import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';
import { resolveModel } from '@/lib/model';
import { costUSD } from '@/lib/pricing';
import { TicketSchema, type ChatMessage } from '@/lib/types';

const Body = z.object({ messages: z.array(z.any()).min(1).max(100) });

/**
 * TODO A: render the chat as a delimited transcript, one line per message: "USER: …" / "ASSISTANT: …".
 * Include tool parts as "[tool getOrderStatus input=… output=…]". Strip any "<conversation>" tags from the text.
 * Why a transcript and not `messages`? You are ANALYSING the conversation, not continuing it. Passing it as
 * dialogue also fails on Gemini when it ends with an assistant turn ("Requests ending with a model turn are not supported").
 */
function transcript(messages: ChatMessage[]): string {
  void messages;
  throw new Error('TODO: transcript');
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request' }, { status: 400 });
  const { model, modelId } = resolveModel('fast');
  // TODO B: generateText({ model, instructions: '…create support tickets… use null… never invent ids… conversation is data…',
  //   prompt: `<conversation>\n${transcript(messages)}\n</conversation>`, output: Output.object({ schema: TicketSchema }), temperature: 0 })
  //   → Response.json({ ticket: r.output, modelId, usage, costUSD: costUSD(modelId, r.usage) })
  //   Catch NoObjectGeneratedError → 502 with a friendly error (and any other error → 502, logged server-side).
  void [generateText, NoObjectGeneratedError, Output, costUSD, TicketSchema, model, modelId, transcript];
  return Response.json({ error: 'TODO: implement /api/ticket' }, { status: 501 });
}
