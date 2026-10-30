// Lab 04: a tool that needs a human "yes" before it acts, using the 2026-07-28 multi-round-trip pattern.
//   round 1: tools/call issueRefund(...)            → result { resultType: 'input_required', inputRequests, requestState }
//   (the HOST asks a person; the model never sees this exchange)
//   round 2: tools/call issueRefund(...) again, plus inputResponses + the requestState echoed back → the refund runs
// The server keeps no memory between rounds. Everything it needs comes back in round 2, from the client.
// So round 2 is untrusted input: the state must be signed, and bound to these exact arguments and this caller.
import { createHash, randomUUID } from 'node:crypto';
import { McpServer, acceptedContent, createRequestStateCodec, inputRequired, inputResponse, type ServerContext } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { AcmeOps, ToolError } from '../../../../phase-04-agents/env/acme-ops.ts';
import { run } from '../../../env/acme-server.ts';

/** What the server hands the client to keep until round 2. Signed (tamper-evident), NOT encrypted: no secrets in here. */
export interface PendingRefund {
  nonce: string; // becomes the idempotency key: replaying round 2 can never refund twice
  argsDigest: string; // the approval is for THESE arguments only
}

export const ApprovalSchema = z.object({
  approve: z.boolean().describe('Approve this refund?'),
  note: z.string().optional().describe('Optional note for the audit log'),
});

const RefundArgs = z.object({
  invoiceId: z.string().describe('Invoice id, format INV-YYYYMMDD'),
  amountUSD: z.number().positive(),
  reason: z.string().describe('One sentence for the billing team'),
  billingError: z.boolean().optional().describe('true only for billing errors such as duplicate charges'),
});
type RefundArgs = z.infer<typeof RefundArgs>;

/** A canonical digest of the arguments (sorted keys), so {a,b} and {b,a} are the same request. */
export function digestArgs(args: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))));
  return createHash('sha256').update(canonical).digest('base64url');
}

/** The question a person can actually decide on: the consequence, in their words, not the tool call. */
export function describeRefund(ops: AcmeOps, args: RefundArgs): string {
  const inv = ops.world.invoices.find((i) => i.id === args.invoiceId)!;
  const customer = ops.world.customers.find((c) => c.id === inv.customerId)!;
  return `Refund USD ${args.amountUSD} to ${customer.name} (${customer.id}) on invoice ${inv.id} from ${inv.date}? Reason: ${args.reason}${args.billingError ? ' [billing error]' : ''}`;
}

export function createRefundServer(ops: AcmeOps, opts: { stateKey: string }): McpServer {
  const codec = createRequestStateCodec<PendingRefund>({
    key: opts.stateKey, // ≥ 32 bytes, shared by every instance that can receive round 2
    ttlSeconds: 300, // an approval request older than 5 minutes is void
    bind: (ctx: ServerContext) => `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? 'local'}`, // only the caller who started it can finish it
  });
  const server = new McpServer({ name: 'acme-refunds', version: '1.0.0' }, { requestState: { verify: codec.verify } });

  server.registerTool(
    'issueRefund',
    {
      description: 'Refund (part of) a paid invoice. A person from billing must approve every refund: the call pauses until they answer.',
      inputSchema: RefundArgs,
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (args, ctx) => {
      const pending = ctx.mcpReq.requestState<PendingRefund>(); // already verified (signature, expiry, caller) by the codec
      if (!pending) {
        // Round 1, or a client that "pre-approved" by sending inputResponses without our state: ask.
        // Policy first: never ask a human to approve something that would fail anyway. AcmeOps clones the world,
        // so this is a dry run against the same rules the real refund will use.
        try {
          new AcmeOps(ops.world).issueRefund({ ...args, idempotencyKey: 'dry-run' });
        } catch (e) {
          if (e instanceof ToolError) return { isError: true, content: [{ type: 'text', text: e.message }] };
          throw e;
        }
        return inputRequired({
          inputRequests: { approval: inputRequired.elicit({ message: describeRefund(ops, args), requestedSchema: ApprovalSchema }) },
          requestState: await codec.mint({ nonce: randomUUID(), argsDigest: digestArgs(args) }, ctx),
        });
      }
      if (pending.argsDigest !== digestArgs(args)) {
        return { isError: true, content: [{ type: 'text', text: 'This approval was given for different refund details. Nothing was refunded; request the refund again.' }] };
      }
      const view = inputResponse(ctx.mcpReq.inputResponses, 'approval');
      const answer = acceptedContent(ctx.mcpReq.inputResponses, 'approval', ApprovalSchema);
      if (view.kind !== 'elicit' || answer?.approve !== true) {
        const out = { refunded: false, decision: 'declined', note: answer?.note ?? null };
        return { content: [{ type: 'text', text: `The approver declined. Nothing was refunded. ${answer?.note ?? ''}`.trim() }], structuredContent: out };
      }
      return run('issueRefund', () => ({ refunded: true, ...ops.issueRefund({ ...args, idempotencyKey: pending.nonce }), approvalNote: answer.note ?? null }));
    },
  );
  return server;
}

// ---------- the host side ----------
export interface ApprovalRequest {
  message: string;
}
export type Approver = (req: ApprovalRequest) => Promise<{ approve: boolean; note?: string } | 'dismissed'>;

/**
 * The client's `elicitation/create` handler: show the server's question to a PERSON and return their answer.
 * The model is not in this loop, and must never be: an agent approving its own refund is no approval.
 */
export function elicitationHandler(approver: Approver) {
  return async (params: { message: string }) => {
    const answer = await approver({ message: params.message });
    if (answer === 'dismissed') return { action: 'cancel' as const };
    return answer.approve ? { action: 'accept' as const, content: { approve: true, ...(answer.note ? { note: answer.note } : {}) } } : { action: 'decline' as const };
  };
}
