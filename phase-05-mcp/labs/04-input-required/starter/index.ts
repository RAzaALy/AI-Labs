// Lab 04 (starter): a tool that needs a human "yes" before it acts, using the 2026-07-28 multi-round-trip pattern.
//   round 1: tools/call issueRefund(...)            → result { resultType: 'input_required', inputRequests, requestState }
//   (the HOST asks a person; the model never sees this exchange)
//   round 2: tools/call issueRefund(...) again, plus inputResponses + the requestState echoed back → the refund runs
// The server keeps no memory between rounds. Everything it needs comes back in round 2, from the client.
// So round 2 is untrusted input: the state must be signed, and bound to these exact arguments and this caller.
import { createHash, randomUUID } from 'node:crypto';
import { McpServer, acceptedContent, createRequestStateCodec, inputRequired, inputResponse } from '@modelcontextprotocol/server';
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
  // TODO 1: sha256 (base64url) of JSON.stringify of the args with keys SORTED, so key order doesn't matter
  void createHash;
  throw new Error('TODO: digestArgs');
}

/** The question a person can actually decide on: the consequence, in their words, not the tool call. */
export function describeRefund(ops: AcmeOps, args: RefundArgs): string {
  // TODO 2: "Refund USD <amount> to <customer name> (<id>) on invoice <id> from <date>? Reason: <reason>"
  //   (look the invoice and customer up in ops.world). A person decides on consequences, not on JSON.
  throw new Error('TODO: describeRefund');
}

export function createRefundServer(ops: AcmeOps, opts: { stateKey: string }): McpServer {
  // TODO 3: const codec = createRequestStateCodec<PendingRefund>({ key: opts.stateKey, ttlSeconds: 300,
  //   bind: ctx => `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? 'local'}` })
  //   and pass { requestState: { verify: codec.verify } } as the McpServer options.
  const server = new McpServer({ name: 'acme-refunds', version: '1.0.0' });

  // TODO 4: register issueRefund (inputSchema: RefundArgs, destructiveHint). The handler:
  //   const pending = ctx.mcpReq.requestState<PendingRefund>()
  //   - no pending (round 1, or a client "pre-approving"): dry-run the policy with
  //       new AcmeOps(ops.world).issueRefund({ ...args, idempotencyKey: 'dry-run' })  (ToolError → isError result)
  //     then return inputRequired({ inputRequests: { approval: inputRequired.elicit({ message, requestedSchema: ApprovalSchema }) },
  //                                 requestState: await codec.mint({ nonce: randomUUID(), argsDigest: digestArgs(args) }, ctx) })
  //   - pending.argsDigest !== digestArgs(args) → isError "approval was for different details, nothing refunded"
  //   - answer = acceptedContent(ctx.mcpReq.inputResponses, 'approval', ApprovalSchema); not approved →
  //       { content: [...'Nothing was refunded'...], structuredContent: { refunded: false, decision: 'declined', note } }
  //   - approved → run('issueRefund', () => ({ refunded: true, ...ops.issueRefund({ ...args, idempotencyKey: pending.nonce }) }))
  void [createRequestStateCodec, inputRequired, inputResponse, acceptedContent, randomUUID, ToolError, run, RefundArgs, z];
  void ops;
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
  // TODO 5: return async (params) => { ask approver({ message: params.message }) and map the answer:
  //   'dismissed' → { action: 'cancel' } · approve → { action: 'accept', content: { approve: true, note? } } · else { action: 'decline' }
  void approver;
  throw new Error('TODO: elicitationHandler');
}
