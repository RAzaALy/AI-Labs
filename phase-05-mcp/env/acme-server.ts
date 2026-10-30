// Phase 4's Acme operations tools, served over MCP. The world (AcmeOps) and its rules are unchanged:
// only the way an agent reaches the tools is new. Labs 02–05 connect to this server; Lab 01 builds its own.
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { AcmeOps, ToolError, searchHandbook } from '../../phase-04-agents/env/acme-ops.ts';

type Result = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/**
 * Run a tool body and turn the outcome into an MCP result. A ToolError is part of the conversation (the model
 * reads it and recovers); anything else is OUR bug, so the client gets a reference id and the details go to stderr.
 */
export async function run(tool: string, fn: () => unknown): Promise<Result> {
  try {
    const out = (await fn()) as Record<string, unknown>;
    return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
  } catch (e) {
    if (e instanceof ToolError) return { isError: true, content: [{ type: 'text', text: e.message }] };
    const ref = Math.random().toString(36).slice(2, 10);
    console.error(`[acme-mcp] ${tool} failed (ref ${ref}):`, e);
    return { isError: true, content: [{ type: 'text', text: `Internal error in ${tool} (ref ${ref}). It was not caused by your input; do not retry, tell the user.` }] };
  }
}

const service = z.enum(['api', 'web', 'worker']);

export function createAcmeServer(ops: AcmeOps = new AcmeOps(), opts: { name?: string } = {}): McpServer {
  const server = new McpServer(
    { name: opts.name ?? 'acme-ops', version: '1.0.0' },
    { instructions: 'Acme operations: customers, invoices, deploys and tickets. Check policy with searchHandbook before acting.' },
  );

  server.registerTool(
    'searchHandbook',
    {
      title: 'Search the handbook',
      description: 'Search the Acme engineering handbook (refund policy, deploys and rollbacks, incidents, security...). Returns up to 3 sections with their source file.',
      inputSchema: z.object({ query: z.string().describe('Keywords or a question, e.g. "refund window days"') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ query }) => run('searchHandbook', async () => ({ hits: (await searchHandbook(query)).map((h) => ({ source: `${h.file} › ${h.section || '(intro)'}`, excerpt: h.text.slice(0, 600) })) })),
  );
  server.registerTool(
    'findCustomers',
    {
      description: 'Find customers by part of their name, email or id. Returns id (format C-123), name, email and plan.',
      inputSchema: z.object({ query: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ query }) => run('findCustomers', () => ({ customers: ops.findCustomers(query) })),
  );
  server.registerTool(
    'listInvoices',
    {
      description: "A customer's invoices: amount, date, daysAgo, status and refundableUSD.",
      inputSchema: z.object({ customerId: z.string().describe('Customer id, format C-123') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ customerId }) => run('listInvoices', () => ({ invoices: ops.listInvoices(customerId) })),
  );
  server.registerTool(
    'getDeployStatus',
    {
      description: 'Current production deploy of a service: version, previous version, status (healthy/degraded) and error rate.',
      inputSchema: z.object({ service }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ service }) => run('getDeployStatus', () => ops.getDeployStatus(service)),
  );
  server.registerTool(
    'rollback',
    {
      description: 'Roll a DEGRADED service back to its previous known-good version. Fails for healthy services. No approval needed (handbook).',
      inputSchema: z.object({ service }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ service }) => run('rollback', () => ops.rollback(service)),
  );
  server.registerTool(
    'createTicket',
    {
      description: 'Open a ticket for a human team (billing, SRE, support): follow-ups such as post-incident reviews, or anything you may not do yourself.',
      inputSchema: z.object({ subject: z.string(), body: z.string(), priority: z.enum(['low', 'normal', 'high', 'urgent']), customerId: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (input) => run('createTicket', () => ops.createTicket(input)),
  );
  return server;
}
