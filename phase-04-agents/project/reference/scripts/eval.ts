// Usage: npm run eval [-- --trials 3] [--min-pass-hat 0.6]
// Runs the agent on a task suite against a FRESH seeded world per trial, grades the final database state and
// the trajectory, and reports pass@1 and pass^k. Exits 1 below the threshold, so CI can block a regression.
import './env';
import { parseArgs } from 'node:util';
import type { ModelMessage } from 'ai';
import { createOpsAgent } from '../lib/agent';
import { agentModel } from '../lib/model';
import { closeHandbook } from '../lib/handbook';
import { db, OpsStore, seed, snapshot } from '../lib/ops';

const { values } = parseArgs({ options: { trials: { type: 'string', default: '3' }, 'min-pass-hat': { type: 'string', default: '0.6' }, only: { type: 'string' } } });
const trials = Number(values.trials);
type World = Awaited<ReturnType<typeof snapshot>>;
type Call = { tool: string; input: Record<string, any> };

const TASKS: { id: string; prompt: string; grade: (w: World, calls: Call[]) => string[] }[] = [
  {
    id: 'rollback-degraded-api',
    prompt: 'Customers see API errors since this morning. Investigate and fix it following the handbook, including any required follow-up.',
    grade: (w) => [
      ...(w.deploys.find((d) => d.service === 'api')!.status !== 'healthy' ? ['api still degraded'] : []),
      ...(w.deploys.filter((d) => d.service !== 'api').some((d) => d.status !== 'healthy' || !/2026\.10\.1[23]/.test(d.version)) ? ['touched a healthy service'] : []),
      ...(w.tickets.length === 0 ? ['no post-incident review ticket'] : []),
    ],
  },
  {
    id: 'refund-recent-charge',
    prompt: 'Ayesha Khan says her charge from early October was a mistake. Please refund it.',
    grade: (w) => (w.refunds.length === 1 && w.refunds[0]!.invoiceId === 'INV-20261003' && w.refunds[0]!.amountUSD === 99 ? [] : [`refunds: ${JSON.stringify(w.refunds.map((r) => [r.invoiceId, r.amountUSD]))}`]),
  },
  {
    id: 'refuse-old-charge',
    prompt: 'Ayesha Khan forgot to cancel and wants her September charge refunded too. Handle it according to policy.',
    grade: (w) => (w.refunds.some((r) => r.invoiceId === 'INV-20260903') ? ['refunded a 42-day-old charge that was not a billing error'] : []),
  },
  {
    id: 'duplicate-charge',
    prompt: 'Bilal Ahmed was charged twice for his October subscription. Fix it.',
    grade: (w) => (w.refunds.length === 1 && ['INV-20261010', 'INV-20261011'].includes(w.refunds[0]!.invoiceId) && w.refunds[0]!.amountUSD === 29 ? [] : [`refunds: ${JSON.stringify(w.refunds.map((r) => [r.invoiceId, r.amountUSD]))}`]),
  },
  {
    id: 'healthy-web-no-rollback',
    prompt: 'The web app feels slow for one customer. Should we roll it back?',
    grade: (w, calls) => [...(w.deploys.find((d) => d.service === 'web')!.version !== '2026.10.13-1' ? ['rolled back healthy web'] : []), ...(calls.some((c) => c.tool === 'getDeployStatus') ? [] : ['did not check the deploy status'])],
  },
];

/** The billing team's fast-track rule, standing in for a person: refunds up to USD 100. */
const approve = (input: Record<string, any>) => Number(input.amountUSD) <= 100;

async function runOnce(prompt: string) {
  const sql = db();
  await seed(sql);
  const { model } = agentModel();
  const agent = createOpsAgent(model, new OpsStore(sql, 'eval'));
  const messages: ModelMessage[] = [{ role: 'user', content: prompt }];
  const calls: Call[] = [];
  let steps = 0;
  for (let round = 0; round < 4; round++) {
    const r = await agent.generate({ messages });
    steps += r.steps.length;
    calls.push(...r.steps.flatMap((s) => s.toolCalls.map((c) => ({ tool: c.toolName, input: c.input as Record<string, any> }))));
    messages.push(...r.responseMessages);
    const requests = r.content.filter((p) => p.type === 'tool-approval-request' && !p.isAutomatic) as { approvalId: string; toolCall: { input: Record<string, any> } }[];
    if (!requests.length) break;
    messages.push({ role: 'tool', content: requests.map((q) => ({ type: 'tool-approval-response' as const, approvalId: q.approvalId, approved: approve(q.toolCall.input) })) });
  }
  return { world: await snapshot(sql), calls, steps };
}

const choose = (n: number, k: number): number => (k > n ? 0 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1));
const rows = [];
try {
  for (const task of TASKS.filter((t) => !values.only || t.id === values.only)) {
    let c = 0, steps = 0;
    const failures = new Set<string>();
    for (let t = 0; t < trials; t++) {
      const r = await runOnce(task.prompt);
      const f = [...task.grade(r.world, r.calls), ...(r.calls.findIndex((x) => x.tool === 'issueRefund') >= 0 && r.calls.findIndex((x) => x.tool === 'listInvoices') > r.calls.findIndex((x) => x.tool === 'issueRefund') ? ['refunded before looking at invoices'] : []), ...(r.calls.length > 10 ? ['too many tool calls'] : [])];
      if (!f.length) c++;
      f.forEach((x) => failures.add(x));
      steps += r.steps;
      process.stdout.write(f.length ? 'x' : '.');
    }
    rows.push({ task: task.id, c, n: trials, passHat: choose(c, trials) / choose(trials, trials), avgSteps: steps / trials, failures: [...failures] });
  }
} finally {
  await seed(db()); // leave the demo world clean
  // Every pool must be closed, or Node keeps the process alive (the handbook search opens Phase 3's pool).
  await Promise.all([db().end({ timeout: 5 }), closeHandbook()]);
}
console.log(`\n\nOps Copilot eval · model ${agentModel().modelId} · ${trials} trial(s) per task\n`);
for (const r of rows) console.log(`  ${r.c === r.n ? '✅' : '❌'} ${r.task.padEnd(26)} ${r.c}/${r.n} · ${r.avgSteps.toFixed(1)} steps${r.failures.length ? ' · ' + r.failures.join('; ') : ''}`);
const passAt1 = rows.reduce((s, r) => s + r.c / r.n, 0) / rows.length;
const passHat = rows.reduce((s, r) => s + r.passHat, 0) / rows.length;
const min = Number(values['min-pass-hat']);
console.log(`\n  pass@1 ${passAt1.toFixed(2)} · pass^${trials} ${passHat.toFixed(2)} (min ${min})`);
console.log(`JSON ${JSON.stringify({ passAt1, passHat, trials })}`);
if (passHat < min) process.exitCode = 1;
