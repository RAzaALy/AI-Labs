// Server-side tools. The model only REQUESTS these; this file decides what actually runs.
import { cosineSimilarity, embedMany, embed, tool } from 'ai';
import { z } from 'zod';
import { embeddingModel } from './model';
import { KNOWLEDGE_BASE } from './knowledge-base';

/** Errors whose message is safe to show the end user (and useful for the model to recover). */
export class UserFacingError extends Error {}

const ORDERS: Record<string, { status: string; totalUSD: number; eta?: string; customer: string }> = {
  'ORD-1001': { status: 'shipped', totalUSD: 129.99, eta: '2026-10-14', customer: 'demo' },
  'ORD-1002': { status: 'processing', totalUSD: 42.5, customer: 'demo' },
  'ORD-1003': { status: 'refunded', totalUSD: 310, customer: 'demo' },
};
const RATES_TO_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, PKR: 1 / 280 };

// Knowledge-base vectors are computed once per server process (a real app stores them: Phase 3).
let kbVectors: Promise<number[][]> | undefined;
const getKbVectors = () => (kbVectors ??= embedMany({ model: embeddingModel(), values: KNOWLEDGE_BASE }).then((r) => r.embeddings));

export const tools = {
  getOrderStatus: tool({
    description: 'Look up an order by id (format ORD-1234). Returns status, total in USD and ETA when shipped.',
    inputSchema: z.object({ orderId: z.string().regex(/^ORD-\d+$/i).describe('e.g. ORD-1001') }),
    execute: async ({ orderId }) => {
      // In a real app: authorize — does this order belong to the signed-in user?
      const order = ORDERS[orderId.toUpperCase()];
      if (!order) throw new UserFacingError(`Order ${orderId} not found. Ask the user to double-check the id.`);
      const { customer: _, ...visible } = order;
      return { orderId: orderId.toUpperCase(), ...visible };
    },
  }),
  convertCurrency: tool({
    description: 'Convert an amount between currencies with today\'s rates. Supported: USD, EUR, GBP, PKR.',
    inputSchema: z.object({ amount: z.number(), from: z.string().length(3), to: z.string().length(3) }),
    execute: async ({ amount, from, to }) => {
      const f = RATES_TO_USD[from.toUpperCase()];
      const t = RATES_TO_USD[to.toUpperCase()];
      if (!f || !t) throw new UserFacingError(`Unsupported currency. Supported: ${Object.keys(RATES_TO_USD).join(', ')}`);
      return { amount, from: from.toUpperCase(), to: to.toUpperCase(), converted: Math.round(((amount * f) / t) * 100) / 100 };
    },
  }),
  searchKnowledgeBase: tool({
    description: 'Search the internal runbook/policy knowledge base. Use for questions about policies, operations, limits and procedures.',
    inputSchema: z.object({ query: z.string().describe('A natural-language search query') }),
    execute: async ({ query }) => {
      // TODO C: semantic search over KNOWLEDGE_BASE.
      //  1. embed the query: (await embed({ model: embeddingModel(), value: query })).embedding
      //  2. get the KB vectors with getKbVectors() (computed once per process, provided above)
      //  3. score each with cosineSimilarity, sort desc, return { hits: top 3 as { text, score } }
      void [embed, cosineSimilarity, getKbVectors, query];
      return { hits: [] as { text: string; score: number }[] };
    },
  }),
};
