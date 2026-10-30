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
  // ToolError → its message as-is.
  // Anything else → a generic "internal error (not caused by your input); do not retry the same call" message. Never include e.message: it may leak internals.
  throw new Error('TODO: actionableError');
}

/**
 * One task-shaped tool instead of findCustomers → listInvoices: "who is this customer and what can be refunded?"
 * Accepts whatever the user gave (name, email, id). Ambiguity is an error that lists the candidates.
 */
export function lookupCustomerBilling(ops: AcmeOps, customer: string) {
  // matches = ops.findCustomers(customer); 0 matches or >1 → throw ToolError that says what to do next (list candidates with ids).
  // Return { customer: { id, name, plan }, invoices: ops.listInvoices(id) mapped to { id, amountUSD, date, daysAgo, status, refundableUSD, withinRefundWindow: daysAgo <= 30 } }.
  throw new Error('TODO: lookupCustomerBilling');
}

/** Search results with a source and a size limit: high signal, bounded tokens. */
export async function searchPolicy(query: string, maxChars = 500) {
  // searchHandbook(query, 3) → [{ source: `${file} › ${section}`, excerpt: text cut to maxChars (+ "…") }]
  throw new Error('TODO: searchPolicy');
}

export function goodTools(ops: AcmeOps) {
  // Two tools: lookupCustomerBilling({ customer }) and searchPolicy({ query }), with descriptions written for the model.
  // Wrap each execute so thrown errors come back as { error: actionableError(e) } instead of throwing.
  throw new Error('TODO: goodTools');
}

/** Tool definitions are sent with EVERY step. This is what they cost you each time. */
export function definitionTokens(tools: ToolSet): number {
  // tokens() of [{ name, description, parameters: asSchema(t.inputSchema).jsonSchema }] for every tool.
  throw new Error('TODO: definitionTokens');
}
