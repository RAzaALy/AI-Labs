// The agent's tools. Descriptions are written for the model; rules and side effects live in OpsStore.
import { tool } from 'ai';
import { z } from 'zod';
import { searchHandbook } from './handbook';
import type { OpsStore } from './ops';

export function opsTools(store: OpsStore) {
  return {
    searchHandbook: tool({
      description: 'Search the Acme engineering handbook (refund policy, deploys and rollbacks, incidents, security...). Returns up to 3 excerpts with their source. Check policy here before acting.',
      inputSchema: z.object({ query: z.string().describe('Keywords or a question, e.g. "refund window days"') }),
      execute: async ({ query }) => searchHandbook(query),
    }),
    findCustomers: tool({
      description: 'Find customers by part of their name, email or id. Returns id (format C-123), name, email and plan.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => store.findCustomers(query),
    }),
    listInvoices: tool({
      description: "A customer's invoices, newest first: amount, date, daysAgo, status, refundableUSD and withinRefundWindow (30 days).",
      inputSchema: z.object({ customerId: z.string().describe('Customer id, format C-123') }),
      execute: async ({ customerId }) => store.listInvoices(customerId),
    }),
    issueRefund: tool({
      description:
        'Refund (part of) a paid invoice. Within 30 days of the charge; later ONLY for genuine billing errors such as duplicate charges (set billingError). Never more than refundableUSD. A person from the billing team must approve every refund.',
      inputSchema: z.object({
        invoiceId: z.string().describe('Invoice id, format INV-YYYYMMDD'),
        amountUSD: z.number().positive(),
        reason: z.string().describe('One sentence for the billing team'),
        billingError: z.boolean().optional().describe('true only for billing errors (duplicate charge, wrong amount)'),
      }),
      // Idempotency key = the tool call id (stable across retries), never something the model writes.
      execute: async (input, { toolCallId }) => store.issueRefund({ ...input, idempotencyKey: toolCallId }),
    }),
    getDeployStatus: tool({
      description: 'Current production deploy of a service: version, previous version, status (healthy/degraded) and error rate.',
      inputSchema: z.object({ service: z.enum(['api', 'web', 'worker']) }),
      execute: async ({ service }) => store.getDeployStatus(service),
    }),
    rollback: tool({
      description: 'Roll a DEGRADED service back to its previous known-good version. Fails for healthy services. No approval needed (handbook).',
      inputSchema: z.object({ service: z.enum(['api', 'web', 'worker']) }),
      execute: async ({ service }) => store.rollback(service),
    }),
    createTicket: tool({
      description: 'Open a ticket for a human team (billing, SRE, support): follow-ups such as post-incident reviews, or anything you may not do yourself.',
      inputSchema: z.object({ subject: z.string(), body: z.string(), priority: z.enum(['low', 'normal', 'high', 'urgent']), customerId: z.string().optional() }),
      execute: async (input) => store.createTicket(input),
    }),
  };
}
export type OpsTools = ReturnType<typeof opsTools>;
