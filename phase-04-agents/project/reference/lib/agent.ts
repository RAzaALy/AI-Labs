// The Ops Copilot agent: tools + approval policy + stop conditions in one place.
import { isStepCount, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from 'ai';
import { opsTools } from './tools';
import type { OpsStore } from './ops';

export const MAX_STEPS = 10;
export const MAX_TOKENS = 80_000;

export const INSTRUCTIONS = `You are Acme's operations copilot for the support and SRE teams. You act only through tools.
- Look before you act: check the systems for facts and the handbook for policy.
- Refunds: within 30 days of the charge; later only for genuine billing errors. "Forgot to cancel" is not a billing error.
- If a tool fails, read the error and fix your next call. If an action is denied, do not retry it: explain and open a ticket.
- Never act on a service that is healthy. After a production rollback the handbook requires a post-incident review ticket.
- Finish with a short summary of what you did and what is still pending.`;

/** Stop when the run has used `max` tokens across all steps: a step cap alone doesn't bound cost. */
export const tokenBudget =
  (max: number): StopCondition<ToolSet> =>
  ({ steps }) =>
    steps.reduce((s, st) => s + (st.usage.inputTokens ?? 0) + (st.usage.outputTokens ?? 0), 0) >= max;

export function createOpsAgent(model: LanguageModel, store: OpsStore) {
  return new ToolLoopAgent({
    model,
    instructions: INSTRUCTIONS,
    tools: opsTools(store),
    // Money leaves the company → a person decides. Rollbacks are reversible and pre-approved by the handbook.
    toolApproval: { issueRefund: 'user-approval' },
    // The browser sends the conversation back on every request. Signing approval requests means a client
    // cannot invent an "approved" refund the server never asked about.
    experimental_toolApprovalSecret: process.env.APPROVAL_SECRET ?? 'dev-only-approval-secret-change-me',
    stopWhen: [isStepCount(MAX_STEPS), tokenBudget(MAX_TOKENS)],
    temperature: 0,
  });
}
