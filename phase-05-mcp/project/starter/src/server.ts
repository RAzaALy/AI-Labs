// Acme MCP (starter): Phase 4's operations (Postgres, OpsStore rules, audit log) and Phase 3's handbook search, served to ANY
// MCP host: Claude Code, the Inspector, your own agent. One factory serves both transports:
//   stdio (local, trusted: the user who started it)  ·  Streamable HTTP (remote: bearer tokens + scopes)
import { createHash, randomUUID } from 'node:crypto';
import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  acceptedContent,
  createRequestStateCodec,
  inputRequired,
  requireScopes,
  type ScopeChallengeHandler,
  type ServerContext,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { OpsStore, TODAY, ToolError, snapshot, type Sql } from '../../../../phase-04-agents/project/reference/lib/ops.ts';
import { searchHandbook } from '../../../../phase-04-agents/project/reference/lib/handbook.ts';
import { loadCorpus } from '../../../../shared/corpus.ts';

export const SCOPES = { read: 'ops:read', deploy: 'ops:deploy', tickets: 'tickets:write', refund: 'billing:refund' } as const;

export interface ServerOptions {
  sql: Sql;
  /** Who is acting: the token's clientId over HTTP, the local user over stdio. Every audit row records it. */
  actor: string;
  /** HMAC key for multi-round-trip state (≥ 32 bytes). Every instance that can receive a retry needs the same key. */
  stateKey: string;
  /** Test hook: this tool throws an unexpected (non-policy) error, to prove internals never reach the client. */
  fault?: string;
}

type Result = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** ToolError → the model reads it and recovers. Anything else → a reference id for the client, details to stderr. */
async function run(tool: string, opts: ServerOptions, fn: () => Promise<unknown>): Promise<Result> {
  // TODO 1 (Lab 01): run fn() and return { content: [JSON text], structuredContent: out }.
  //   ToolError → { isError: true, content: [e.message] } (the model reads it and recovers)
  //   anything else → isError with a generic message + reference id; log the details with console.error (stderr).
  //   Keep the test hook: if (opts.fault === tool) throw new Error(...) before calling fn, so AC9 can check you.
  void randomUUID;
  void tool;
  void opts;
  void fn;
  throw new Error('TODO: run');
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const slugOf = (file: string) => file.replace(/\.md$/, '');
const currentDocs = async () => (await loadCorpus()).filter((d) => d.meta.status !== 'deprecated').sort((a, b) => a.file.localeCompare(b.file));
const digest = (args: Record<string, unknown>) =>
  createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))))).digest('base64url');

/**
 * Refund preview: the same checks OpsStore.issueRefund makes, run BEFORE asking a person, so nobody approves a refund
 * that would fail. It is a convenience, not the guard: OpsStore re-checks everything inside the transaction.
 */
async function previewRefund(sql: Sql, args: { invoiceId: string; amountUSD: number; billingError?: boolean }) {
  const [inv] = await sql`SELECT i.id, i.amount_usd, i.refunded_usd, i.status, i.date, c.name, c.id AS customer_id
                          FROM ops_invoices i JOIN ops_customers c ON c.id = i.customer_id WHERE i.id = ${args.invoiceId}`;
  if (!inv) throw new ToolError(`No invoice ${args.invoiceId}. Use listInvoices(customerId) to see valid invoice ids.`);
  if (inv.status !== 'paid') throw new ToolError(`Invoice ${inv.id} was never paid (status: ${inv.status}), so there is nothing to refund.`);
  const left = Number(inv.amount_usd) - Number(inv.refunded_usd);
  if (args.amountUSD > left) throw new ToolError(`Only USD ${left} of invoice ${inv.id} is refundable.`);
  const date = (inv.date as Date).toISOString().slice(0, 10);
  const age = daysBetween(date, TODAY);
  if (age > 30 && !args.billingError) throw new ToolError(`Invoice ${inv.id} is ${age} days old. Refunds after 30 days are allowed only for billing errors (set billingError: true and explain the error in reason).`);
  return { customer: `${inv.name} (${inv.customer_id})`, date };
}

export const ApprovalSchema = z.object({ approve: z.boolean().describe('Approve this refund?'), note: z.string().optional().describe('Optional note for the audit log') });
interface PendingRefund {
  nonce: string;
  argsDigest: string;
}

export function createAcmeMcpServer(opts: ServerOptions): McpServer {
  const { sql } = opts;
  const store = new OpsStore(sql, opts.actor);
  const codec = createRequestStateCodec<PendingRefund>({
    key: opts.stateKey,
    ttlSeconds: 600,
    bind: (ctx: ServerContext) => `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? opts.actor}`,
  });
  const server = new McpServer(
    { name: 'acme-ops', version: '2.0.0' },
    {
      instructions:
        'Acme operations: deploys, customers, invoices, refunds, tickets, and the engineering handbook. Check policy with searchHandbook before acting. Refunds pause for a person in billing to approve.',
      requestState: { verify: codec.verify },
    },
  );
  // Over HTTP every tool declares the scope it needs; over stdio there is no token, and the local user may do everything.
  // TODO 2 (Lab 03): return { scopeChallenge: requireScopes(s) } so HTTP callers need the scope for each tool.
  const scope = (s: string): { scopeChallenge?: ScopeChallengeHandler } => (void s, void requireScopes, {});
  const service = z.enum(['api', 'web', 'worker']);

  server.registerTool(
    'searchHandbook',
    {
      title: 'Search the handbook',
      description: 'Search the Acme engineering handbook (refund policy, deploys and rollbacks, incidents, security...). Returns up to 3 excerpts with their source. Check policy here before acting.',
      inputSchema: z.object({ query: z.string().min(2).describe('Keywords or a question, e.g. "refund window days"') }),
      outputSchema: z.object({ hits: z.array(z.object({ source: z.string(), excerpt: z.string() })) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      ...scope(SCOPES.read),
    },
    ({ query }) => run('searchHandbook', opts, async () => ({ hits: await searchHandbook(query) })),
  );
  server.registerTool(
    'findCustomers',
    {
      description: 'Find customers by part of their name, email or id. Returns id (format C-123), name, email and plan.',
      inputSchema: z.object({ query: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      ...scope(SCOPES.read),
    },
    ({ query }) => run('findCustomers', opts, async () => ({ customers: [...(await store.findCustomers(query))] })),
  );
  server.registerTool(
    'listInvoices',
    {
      description: "A customer's invoices, newest first: amount, date, daysAgo, status, refundableUSD and withinRefundWindow (30 days).",
      inputSchema: z.object({ customerId: z.string().describe('Customer id, format C-123') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      ...scope(SCOPES.read),
    },
    ({ customerId }) => run('listInvoices', opts, async () => ({ invoices: await store.listInvoices(customerId) })),
  );
  server.registerTool(
    'getDeployStatus',
    {
      description: 'Current production deploy of a service: version, previous version, status (healthy/degraded) and error rate.',
      inputSchema: z.object({ service }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      ...scope(SCOPES.read),
    },
    ({ service }) => run('getDeployStatus', opts, () => store.getDeployStatus(service)),
  );
  server.registerTool(
    'rollback',
    {
      description: 'Roll a DEGRADED service back to its previous known-good version. Fails for healthy services. No approval needed (handbook).',
      inputSchema: z.object({ service }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      ...scope(SCOPES.deploy),
    },
    ({ service }) => run('rollback', opts, () => store.rollback(service)),
  );
  server.registerTool(
    'createTicket',
    {
      description: 'Open a ticket for a human team (billing, SRE, support): follow-ups such as post-incident reviews, or anything you may not do yourself.',
      inputSchema: z.object({ subject: z.string(), body: z.string(), priority: z.enum(['low', 'normal', 'high', 'urgent']), customerId: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      ...scope(SCOPES.tickets),
    },
    (input) => run('createTicket', opts, () => store.createTicket(input)),
  );

  server.registerTool(
    'issueRefund',
    {
      description:
        'Refund (part of) a paid invoice. Within 30 days of the charge; later ONLY for genuine billing errors such as duplicate charges (set billingError). Never more than refundableUSD. A person from billing approves every refund: the call pauses until they answer.',
      inputSchema: z.object({
        invoiceId: z.string().describe('Invoice id, format INV-YYYYMMDD'),
        amountUSD: z.number().positive(),
        reason: z.string().describe('One sentence for the billing team'),
        billingError: z.boolean().optional().describe('true only for billing errors (duplicate charge, wrong amount)'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      ...scope(SCOPES.refund),
    },
    async (args, ctx) => {
      // TODO 3 (Lab 04): the two-round refund.
      //   const pending = ctx.mcpReq.requestState<PendingRefund>()
      //   no pending → preview = await run('issueRefund', opts, () => previewRefund(sql, args)); if preview.isError return it;
      //                return inputRequired({ inputRequests: { approval: inputRequired.elicit({ message: "Refund USD … to <customer> on invoice … from <date>? Reason: …", requestedSchema: ApprovalSchema }) },
      //                                       requestState: await codec.mint({ nonce: randomUUID(), argsDigest: digest(args) }, ctx) })
      //   digest mismatch → isError "approval was for different refund details. Nothing was refunded…"
      //   not approved (acceptedContent(..., 'approval', ApprovalSchema)?.approve !== true) → "…declined. Nothing was refunded…", structuredContent { refunded: false }
      //   approved → run('issueRefund', opts, async () => ({ refunded: true, ...(await store.issueRefund({ ...args, idempotencyKey: `mcp:${pending.nonce}` })) }))
      void [ctx, codec, previewRefund, digest, inputRequired, acceptedContent, randomUUID];
      return { isError: true, content: [{ type: 'text' as const, text: `TODO: issueRefund(${JSON.stringify(args)})` }] };
    },
  );

  // ---- resources: context the host or user attaches (not the model's choice) ----
  server.registerResource(
    'handbook-doc',
    new ResourceTemplate('handbook://{slug}', {
      list: async () => ({ resources: (await currentDocs()).map((d) => ({ uri: `handbook://${slugOf(d.file)}`, name: slugOf(d.file), title: d.title, mimeType: 'text/markdown' })) }),
      complete: { slug: async (value) => (await currentDocs()).map((d) => slugOf(d.file)).filter((s) => s.startsWith(value)) },
    }),
    { title: 'Handbook document', mimeType: 'text/markdown' },
    async (uri, { slug }) => {
      const doc = (await currentDocs()).find((d) => slugOf(d.file) === slug);
      if (!doc) throw new ResourceNotFoundError(uri.href);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: doc.body }] };
    },
  );
  server.registerResource(
    'deploys',
    'ops://deploys',
    { title: 'Production deploys', mimeType: 'application/json', description: 'Every service: version, status, error rate. Live.', cacheHint: { ttlMs: 5_000, cacheScope: 'private' } },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify((await snapshot(sql)).deploys) }] }),
  );

  // ---- prompts: workflows the USER picks (a slash command in Claude Code) ----
  server.registerPrompt(
    'incidentReview',
    { title: 'Incident review', description: 'Investigate a service and follow the incident handbook.', argsSchema: z.object({ service: z.enum(['api', 'web', 'worker']) }) },
    async ({ service }) => ({
      messages: [
        { role: 'user', content: { type: 'resource', resource: { uri: 'ops://deploys', mimeType: 'application/json', text: JSON.stringify((await snapshot(sql)).deploys) } } },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Investigate the ${service} service. Check its deploy status and the handbook (deploys and rollbacks, incident response). If it is degraded, roll it back and open the follow-up ticket the handbook requires. If it is healthy, change nothing and say so.`,
          },
        },
      ],
    }),
  );
  return server;
}
