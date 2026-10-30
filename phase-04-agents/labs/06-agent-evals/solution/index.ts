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
  const results = new Map<string, boolean>();
  for (const m of messages)
    if (m.role === 'tool')
      for (const p of m.content) {
        if (p.type === 'tool-result') results.set(p.toolCallId, !['error-text', 'error-json', 'execution-denied'].includes(p.output.type));
      }
  return messages.flatMap((m) =>
    m.role === 'assistant' && Array.isArray(m.content)
      ? m.content.flatMap((p) => (p.type === 'tool-call' ? [{ tool: p.toolName, input: p.input as Record<string, unknown>, ok: results.get(p.toolCallId) ?? false }] : []))
      : [],
  );
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
  const out: string[] = [];
  if (calls.length > maxCalls) out.push(`${calls.length} tool calls (max ${maxCalls})`);
  const firstRefund = calls.findIndex((c) => c.tool === 'issueRefund');
  const firstLookup = calls.findIndex((c) => c.tool === 'listInvoices');
  if (firstRefund >= 0 && (firstLookup < 0 || firstLookup > firstRefund)) out.push('refunded without looking at the invoices first');
  return out;
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
  const ops = new AcmeOps();
  const r = await runWithApprovals(ops, model, task.prompt, billingTeam(ops));
  const calls = trajectory(r.messages);
  const failures = [...task.grade(ops, calls), ...trajectoryRules(calls)];
  return { task: task.id, pass: failures.length === 0, failures, calls: calls.length };
}

const choose = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1));

/** pass@k: chance that at least one of k attempts succeeds (unbiased estimator from n trials, c passes). */
export function passAtK(n: number, c: number, k: number): number {
  return 1 - choose(n - c, k) / choose(n, k);
}
/** pass^k: chance that ALL k attempts succeed: the number that matters when every customer gets one attempt. */
export function passHatK(n: number, c: number, k: number): number {
  return choose(c, k) / choose(n, k);
}

export async function evaluate(tasks: AgentTask[], makeModel: (task: AgentTask, trial: number) => LanguageModel, trials: number) {
  const rows = [];
  for (const task of tasks) {
    const runs: RunOutcome[] = [];
    for (let t = 0; t < trials; t++) runs.push(await runTask(task, makeModel(task, t)));
    const c = runs.filter((r) => r.pass).length;
    rows.push({ task: task.id, n: trials, c, passAt1: passAtK(trials, c, 1), passHatK: passHatK(trials, c, trials), avgCalls: runs.reduce((s, r) => s + r.calls, 0) / trials, failures: [...new Set(runs.flatMap((r) => r.failures))] });
  }
  return rows;
}
