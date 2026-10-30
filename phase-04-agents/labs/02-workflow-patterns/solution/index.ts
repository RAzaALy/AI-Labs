// Workflows: LLM calls wired together by YOUR code along a fixed path. Cheaper, faster and far more
// predictable than an agent. Reach for an agent only when the path genuinely can't be known in advance.
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';

// ---------- 1. Routing: classify once, then hand off to a specialised prompt ----------
export const ROUTES = ['billing', 'incident', 'general'] as const;
export type Route = (typeof ROUTES)[number];

const HANDLERS: Record<Route, string> = {
  billing: 'You are Acme billing support. Be precise about amounts and dates. Never promise a refund: say the billing team decides.',
  incident: 'You are Acme incident triage. Ask for the service name, start time and error messages. Be brief and calm.',
  general: 'You are Acme support. Answer briefly and point to the right team when unsure.',
};

export async function route(message: string, model: LanguageModel): Promise<{ route: Route; reply: string }> {
  const { output } = await generateText({
    model,
    instructions: 'Classify the customer message. billing = charges, invoices, refunds, plans. incident = outages, errors, slowness. general = anything else.',
    prompt: message,
    output: Output.choice({ options: [...ROUTES] }),
    temperature: 0,
  });
  const { text } = await generateText({ model, instructions: HANDLERS[output], prompt: message, temperature: 0 });
  return { route: output, reply: text };
}

// ---------- 2. Parallelisation (voting): independent reviewers at the same time, then aggregate in code ----------
export const ReviewSchema = z.object({ approve: z.boolean(), issues: z.array(z.string()) });
export const REVIEWERS = {
  accuracy: 'Check facts against Acme policy: refunds within 30 days, billing team approves refunds, rollbacks need no approval.',
  tone: 'Check the tone: polite, no blame, no jargon.',
  safety: 'Check that it makes no promises Acme cannot keep and leaks no internal data.',
} as const;

export async function parallelReview(draft: string, model: LanguageModel) {
  const started = Date.now();
  // Promise.all: three calls in flight at once; latency ≈ the slowest one, not the sum.
  const reviews = await Promise.all(
    Object.entries(REVIEWERS).map(async ([name, focus]) => {
      const { output } = await generateText({ model, instructions: `You review customer support replies. ${focus}`, prompt: draft, output: Output.object({ schema: ReviewSchema }), temperature: 0 });
      return { name, ...output };
    }),
  );
  const approvals = reviews.filter((r) => r.approve).length;
  return { approved: approvals >= 2, reviews, ms: Date.now() - started }; // majority vote, decided by code
}

// ---------- 3. Evaluator-optimizer: draft → critique → revise, with a hard cap on rounds ----------
export const VerdictSchema = z.object({ pass: z.boolean(), feedback: z.string() });

export async function evaluatorOptimizer(task: string, criteria: string, model: LanguageModel, maxRounds = 3) {
  const rounds: { draft: string; pass: boolean; feedback: string }[] = [];
  let draft = (await generateText({ model, prompt: task, temperature: 0 })).text;
  for (let i = 0; i < maxRounds; i++) {
    const { output: v } = await generateText({
      model,
      instructions: `You are a strict reviewer. Criteria:\n${criteria}\nPass only if every criterion is met; otherwise give specific, actionable feedback.`,
      prompt: `<draft>\n${draft}\n</draft>`,
      output: Output.object({ schema: VerdictSchema }),
      temperature: 0,
    });
    rounds.push({ draft, pass: v.pass, feedback: v.feedback });
    if (v.pass || i === maxRounds - 1) break;
    draft = (await generateText({ model, prompt: `${task}\n\nYour previous draft:\n${draft}\n\nReviewer feedback:\n${v.feedback}\n\nWrite an improved draft.`, temperature: 0 })).text;
  }
  const last = rounds.at(-1)!;
  return { final: last.draft, passed: last.pass, rounds };
}

// ---------- 4. Orchestrator-workers: plan subtasks dynamically, run workers in parallel, synthesise ----------
export const PlanSchema = z.object({
  subtasks: z.array(z.object({ title: z.string(), instructions: z.string() })).min(1).max(5),
});

export async function orchestratorWorkers(goal: string, model: LanguageModel) {
  const { output: plan } = await generateText({
    model,
    instructions: 'Break the goal into 2-4 independent subtasks that can be done in parallel. Each must be self-contained.',
    prompt: goal,
    output: Output.object({ schema: PlanSchema }),
    temperature: 0,
  });
  const results = await Promise.all(plan.subtasks.map(async (s) => ({ title: s.title, result: (await generateText({ model, instructions: s.instructions, prompt: `${s.title}\n\nOverall goal: ${goal}`, temperature: 0 })).text })));
  const { text } = await generateText({
    model,
    instructions: 'Combine the worker results into one coherent answer. Do not add facts that are not in them.',
    prompt: results.map((r) => `## ${r.title}\n${r.result}`).join('\n\n'),
    temperature: 0,
  });
  return { plan: plan.subtasks, results, answer: text };
}
