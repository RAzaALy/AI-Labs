// Human-in-the-loop: some actions need a person's yes. The approval rule lives in CODE (toolApproval),
// so no prompt, user message or injected document can talk the agent past it.
import { generateText, isStepCount, type LanguageModel, type ModelMessage, type ToolApprovalConfiguration } from 'ai';
import { AcmeOps } from '../../../env/acme-ops.ts';
import { acmeTools, type AcmeTools } from '../../../env/tools.ts';

export const INSTRUCTIONS = `You are Acme's support operations agent. Use tools for every fact.
Refunds follow the handbook: within 30 days of the charge, or later only for billing errors.
If an action is denied, do not retry it: explain, and open a ticket for the billing team instead.`;

/**
 * Who has to say yes, derived from the handbook and from how reversible each action is:
 * - issueRefund: money leaves the company, and "the billing team approves refunds" → always a human.
 * - rollback: "does not need approval" and is itself reversible → automatic.
 * - everything else is read-only or low-risk → automatic.
 */
export const APPROVAL_POLICY: ToolApprovalConfiguration<AcmeTools, never> = {
  // TODO: issueRefund always needs a person ('user-approval'); rollback is automatic ('approved').
};

export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  input: unknown;
}
export type Approver = (req: ApprovalRequest) => Promise<{ approved: boolean; reason?: string }>;

/** One round: run the agent until it finishes OR pauses on approval requests. */
export async function step(ops: AcmeOps, model: LanguageModel, messages: ModelMessage[]) {
  // generateText({ model, instructions: INSTRUCTIONS, messages, tools: acmeTools(ops), toolApproval: APPROVAL_POLICY, stopWhen: isStepCount(8), temperature: 0 })
  // requests = r.content parts of type "tool-approval-request" that are NOT isAutomatic → { approvalId, toolName: p.toolCall.toolName, input: p.toolCall.input }
  // Return { text, requests, responseMessages }.
  throw new Error('TODO: step');
}

/**
 * The full loop. In a web app each round is a separate HTTP request and the human may answer hours later,
 * which is why all state lives in `messages` (persist them) and never in memory.
 */
export async function runWithApprovals(ops: AcmeOps, model: LanguageModel, task: string, approver: Approver, maxRounds = 4) {
  // messages = [{ role: "user", content: task }]; loop up to maxRounds:
  //   r = await step(...); messages.push(...r.responseMessages); no requests → return { text, decisions, messages, rounds }
  //   ask the approver for each request; record decisions; push ONE tool message with a
  //   { type: "tool-approval-response", approvalId, approved, reason } part per request.
  // After maxRounds: throw.
  throw new Error('TODO: runWithApprovals');
}

/** A stand-in for the billing team's rules, e.g. "auto-OK small refunds of recent invoices, everything else no". */
export const billingTeam =
  (ops: AcmeOps, maxUSD = 100): Approver =>
  async ({ toolName, input }) => {
    if (toolName !== 'issueRefund') return { approved: false, reason: `${toolName} is not something billing approves` };
    const { invoiceId, amountUSD } = input as { invoiceId: string; amountUSD: number };
    const inv = ops.world.invoices.find((i) => i.id === invoiceId);
    if (!inv) return { approved: false, reason: `unknown invoice ${invoiceId}` };
    if (amountUSD > maxUSD) return { approved: false, reason: `USD ${amountUSD} is above the USD ${maxUSD} limit for fast-track approval; billing will review it manually` };
    return { approved: true, reason: 'within fast-track limits' };
  };
