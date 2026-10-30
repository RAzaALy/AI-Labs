// Tool design (the "agent-computer interface"): the same environment, exposed two ways.
// Agents are only as good as the tools you give them: their names, descriptions, outputs and errors.
import { asSchema, tool, type ToolSet } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import { AcmeOps, ToolError, searchHandbook } from '../../../env/acme-ops.ts';
import { loadCorpus } from '../../../../shared/corpus.ts';

const enc = getEncoding('o200k_base');
export const tokens = (v: unknown) => enc.encode(typeof v === 'string' ? v : JSON.stringify(v)).length;

// ---------- The "before": tools shaped like the database, not like the task (given) ----------
export function badTools(ops: AcmeOps) {
  return {
    query: tool({
      description: 'Query a table.',
      inputSchema: z.object({ table: z.string(), where: z.record(z.string(), z.string()).optional() }),
      execute: async ({ table, where }) => {
        const rows = (ops.world as unknown as Record<string, Record<string, unknown>[]>)[table];
        if (!rows) throw new Error('ERR_TABLE');
        return rows.filter((r) => Object.entries(where ?? {}).every(([k, v]) => String(r[k]) === v));
      },
    }),
    docs: tool({
      description: 'Get docs.',
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => (await loadCorpus()).filter((d) => d.body.toLowerCase().includes(q.toLowerCase().split(' ')[0]!)).map((d) => d.body),
    }),
  };
}

// ---------- The "after" ----------

/**
 * Turn any thrown error into a message the model can act on. A ToolError already says what to do;
 * anything else is an internal failure: tell the model it's not its fault and not to retry blindly.
 */
export function actionableError(e: unknown): string {
  if (e instanceof ToolError) return e.message;
  return 'Internal error in this tool (not caused by your input). Do not retry the same call; tell the user the system is unavailable or open a ticket.';
}

/**
 * One task-shaped tool instead of findCustomers → listInvoices: "who is this customer and what can be refunded?"
 * Accepts whatever the user gave (name, email, id). Ambiguity is an error that lists the candidates.
 */
export function lookupCustomerBilling(ops: AcmeOps, customer: string) {
  const matches = ops.findCustomers(customer);
  if (matches.length === 0) throw new ToolError(`No customer matches "${customer}". Try part of the name, the email, or the id (format C-123).`);
  if (matches.length > 1) throw new ToolError(`"${customer}" matches ${matches.length} customers: ${matches.map((c) => `${c.id} ${c.name}`).join(', ')}. Call again with the id.`);
  const c = matches[0]!;
  const invoices = ops.listInvoices(c.id).map((i) => ({ id: i.id, amountUSD: i.amountUSD, date: i.date, daysAgo: i.daysAgo, status: i.status, refundableUSD: i.refundableUSD, withinRefundWindow: i.daysAgo <= 30 }));
  return { customer: { id: c.id, name: c.name, plan: c.plan }, invoices };
}

/** Search results with a source and a size limit: high signal, bounded tokens. */
export async function searchPolicy(query: string, maxChars = 500) {
  return (await searchHandbook(query, 3)).map((h) => ({ source: `${h.file} › ${h.section}`, excerpt: h.text.length > maxChars ? h.text.slice(0, maxChars) + '…' : h.text }));
}

export function goodTools(ops: AcmeOps) {
  const safe =
    <I, O>(fn: (input: I) => O | Promise<O>) =>
    async (input: I): Promise<O | { error: string }> => {
      try {
        return await fn(input);
      } catch (e) {
        return { error: actionableError(e) };
      }
    };
  return {
    lookupCustomerBilling: tool({
      description:
        "Find a customer by name, email or id (C-123) and return their plan and invoices, with how much of each is refundable and whether it is inside the 30-day refund window. Use this first for any billing question.",
      inputSchema: z.object({ customer: z.string().describe('Name, email or customer id as the user wrote it') }),
      execute: safe(({ customer }: { customer: string }) => lookupCustomerBilling(ops, customer)),
    }),
    searchPolicy: tool({
      description: 'Search Acme policies (refunds, deploys, incidents, security). Returns up to 3 excerpts with their source.',
      inputSchema: z.object({ query: z.string().describe('A few keywords, e.g. "refund window"') }),
      execute: safe(({ query }: { query: string }) => searchPolicy(query)),
    }),
  };
}

/** Tool definitions are sent with EVERY step. This is what they cost you each time. */
export function definitionTokens(tools: ToolSet): number {
  return tokens(Object.entries(tools).map(([name, t]) => ({ name, description: t.description, parameters: asSchema(t.inputSchema).jsonSchema })));
}
