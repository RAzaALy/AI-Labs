import type { UIMessage } from 'ai';
import { z } from 'zod';

/** Per-message metadata streamed from the server: this is what feeds the token/cost meter. */
export const messageMetadataSchema = z.object({
  modelId: z.string().optional(),
  provider: z.string().optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  costUSD: z.number().optional(),
  steps: z.number().optional(),
});
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;
export type ChatMessage = UIMessage<MessageMetadata>;

export const TicketSchema = z.object({
  category: z.enum(['billing', 'bug', 'feature_request', 'account']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('urgent = outage or money lost right now; high = blocked; medium = degraded; low = question'),
  summary: z.string().max(140).describe('One sentence for the on-call engineer'),
  orderId: z.string().nullable().describe('Order id like ORD-1234 if mentioned, else null. Never invent one.'),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  actionItems: z.array(z.string()).max(3),
});
export type Ticket = z.infer<typeof TicketSchema>;
