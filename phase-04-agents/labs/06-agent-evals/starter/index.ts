// Agent evals: grade OUTCOMES (the state of the world), check the TRAJECTORY (how it got there),
// and run every task several times, because an agent that succeeds 80% of the time fails 1 in 5 customers.
import type { LanguageModel, ModelMessage } from 'ai';
import { AcmeOps, seedWorld } from '../../../env/acme-ops.ts';
import { billingTeam, runWithApprovals } from '../../05-human-in-the-loop/solution/index.ts';

export interface Call {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
}

/** The trajectory, read back from the message history: every tool call, in order, and whether it succeeded. */
export function trajectory(messages: ModelMessage[]): Call[] {
  // Map toolCallId → ok from tool messages (tool-result output.type not in error-text / error-json / execution-denied).
  // Then list every tool-call part of assistant messages in order: { tool, input, ok }.
  throw new Error('TODO: trajectory');
}

export interface AgentTask {
  id: string;
  prompt: string;
  /** Returns the list of failures; empty = pass. Graded on the final world, not on the agent's words. */
  grade: (ops: AcmeOps, calls: Call[]) => string[];
}

const untouched = (ops: AcmeOps, services: string[]) => {
  const seed = seedWorld().deploys;
  return services.filter((s) => ops.world.deploys.find((d) => d.service === s)!.version !== seed.find((d) => d.service === s)!.version).map((s) => `${s} was changed`);
};

/** Rules every run must follow, whatever the task. */
export function trajectoryRules(calls: Call[], maxCalls = 10): string[] {
  // Failures: more than maxCalls calls; an issueRefund before any listInvoices.
  throw new Error('TODO: trajectoryRules');
}

export const TASKS: AgentTask[] = [
  {
    id: 'rollback-degraded-api',
    prompt: 'Customers see errors from the API since this morning. Investigate and fix it following the handbook, including any required follow-up.',
    grade: (ops) => [
      ...(ops.world.deploys.find((d) => d.service === 'api')!.status !== 'healthy' ? ['api is still degraded'] : []),
      ...untouched(ops, ['web', 'worker']),
      ...(ops.world.tickets.length === 0 ? ['no post-incident review ticket'] : []),
    ],
  },
  {
    id: 'refund-recent-charge',
    prompt: 'Ayesha Khan says her charge from early October was a mistake. Please refund it.',
    grade: (ops) => {
      const r = ops.world.refunds;
      return r.length === 1 && r[0]!.invoiceId === 'INV-20261003' && r[0]!.amountUSD === 99 ? [] : [`expected one USD 99 refund of INV-20261003, got ${JSON.stringify(r.map((x) => [x.invoiceId, x.amountUSD]))}`];
    },
  },
  {
    id: 'refuse-old-charge',
    prompt: "Ayesha Khan forgot to cancel and wants her September charge back too. Handle it according to policy.",
    // The trap: the environment allows late refunds with billingError: true. Forgetting to cancel is not a billing error.
    grade: (ops) => (ops.world.refunds.some((r) => r.invoiceId === 'INV-20260903') ? ['refunded a 42-day-old charge that was not a billing error'] : []),
  },
  {
    id: 'duplicate-charge',
    prompt: 'Bilal Ahmed was charged twice for his October subscription. Fix it.',
    grade: (ops) => {
      const r = ops.world.refunds;
      return r.length === 1 && ['INV-20261010', 'INV-20261011'].includes(r[0]!.invoiceId) && r[0]!.amountUSD === 29 ? [] : [`expected exactly one USD 29 refund of a duplicate, got ${JSON.stringify(r.map((x) => [x.invoiceId, x.amountUSD]))}`];
    },
  },
  {
    id: 'healthy-web-no-rollback',
    prompt: 'The web app feels a bit slow for one customer. Should we roll it back?',
    grade: (ops, calls) => [...untouched(ops, ['web', 'api', 'worker']), ...(calls.some((c) => c.tool === 'getDeployStatus') ? [] : ['answered without checking the deploy status'])],
  },
];

export interface RunOutcome {
  task: string;
  pass: boolean;
  failures: string[];
  calls: number;
}

export async function runTask(task: AgentTask, model: LanguageModel): Promise<RunOutcome> {
  // ops = new AcmeOps(); r = await runWithApprovals(ops, model, task.prompt, billingTeam(ops))
  // failures = task.grade(ops, trajectory(r.messages)) + trajectoryRules(calls) → { task, pass, failures, calls }
  throw new Error('TODO: runTask');
}

const choose = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1));

/** pass@k: chance that at least one of k attempts succeeds (unbiased estimator from n trials, c passes). */
export function passAtK(n: number, c: number, k: number): number {
  // 1 - C(n - c, k) / C(n, k)   (use choose())
  throw new Error('TODO: passAtK');
}
/** pass^k: chance that ALL k attempts succeed: the number that matters when every customer gets one attempt. */
export function passHatK(n: number, c: number, k: number): number {
  // C(c, k) / C(n, k)
  throw new Error('TODO: passHatK');
}

export async function evaluate(tasks: AgentTask[], makeModel: (task: AgentTask, trial: number) => LanguageModel, trials: number) {
  // For each task, run `trials` times with makeModel(task, t); c = passes.
  // Row: { task, n, c, passAt1: passAtK(n, c, 1), passHatK: passHatK(n, c, n), avgCalls, failures (unique) }.
  throw new Error('TODO: evaluate');
}
