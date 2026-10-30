// The Acme environment exposed as AI SDK tools. Descriptions are written for the model:
// what the tool does, when to use it, what it returns, and the format of every id.
import { tool } from 'ai';
import { z } from 'zod';
import { AcmeOps, searchHandbook } from './acme-ops.ts';

export function acmeTools(ops: AcmeOps) {
  return {
    searchHandbook: tool({
      description: 'Search the Acme engineering handbook (policies for refunds, deploys, incidents, security, rate limits...). Returns the 3 best sections. Use it before acting on anything policy-related.',
      inputSchema: z.object({ query: z.string().describe('Keywords or a question, e.g. "refund window days"') }),
      execute: async ({ query }) => (await searchHandbook(query, 3)).map((h) => ({ source: `${h.file} › ${h.section}`, text: h.text.slice(0, 700) })),
    }),
    findCustomers: tool({
      description: 'Find customers by part of their name, email or customer id. Returns id (format C-123), name, email and plan.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => ops.findCustomers(query),
    }),
    listInvoices: tool({
      description: "List a customer's invoices with amount, date, status, daysAgo and how much is still refundable.",
      inputSchema: z.object({ customerId: z.string().describe('Customer id, format C-123') }),
      execute: async ({ customerId }) => ops.listInvoices(customerId),
    }),
    issueRefund: tool({
      description:
        'Refund (part of) a paid invoice. Policy: within 30 days of the charge, or later only for billing errors such as duplicate charges. Never more than the refundable amount. Requires approval by the billing team.',
      inputSchema: z.object({
        invoiceId: z.string().describe('Invoice id, format INV-YYYYMMDD'),
        amountUSD: z.number().positive(),
        reason: z.string().describe('Why, in one sentence, for the billing team'),
        billingError: z.boolean().optional().describe('true only for billing errors (e.g. a duplicate charge)'),
      }),
      // The idempotency key comes from the tool call, not from the model: replaying the same call can't refund twice.
      execute: async (input, { toolCallId }) => ops.issueRefund({ ...input, idempotencyKey: toolCallId }),
    }),
    getDeployStatus: tool({
      description: 'Current production deploy of a service: version, previous version, health status and error rate.',
      inputSchema: z.object({ service: z.enum(['api', 'web', 'worker']) }),
      execute: async ({ service }) => ops.getDeployStatus(service),
    }),
    rollback: tool({
      description: 'Roll a DEGRADED service back to its previous known-good version. Fails for healthy services.',
      inputSchema: z.object({ service: z.enum(['api', 'web', 'worker']) }),
      execute: async ({ service }) => ops.rollback(service),
    }),
    createTicket: tool({
      description: 'Open a ticket for a human team (billing, SRE, support). Use for follow-ups you cannot or may not do yourself.',
      inputSchema: z.object({
        subject: z.string(),
        body: z.string(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']),
        customerId: z.string().optional(),
      }),
      execute: async (input) => ops.createTicket(input),
    }),
  };
}
export type AcmeTools = ReturnType<typeof acmeTools>;
