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
  // 1) generateText with output: Output.choice({ options: [...ROUTES] }) and a short classification instruction → output is the route
  // 2) generateText with instructions: HANDLERS[route] and the message → reply
  throw new Error('TODO: route');
}

// ---------- 2. Parallelisation (voting): independent reviewers at the same time, then aggregate in code ----------
export const ReviewSchema = z.object({ approve: z.boolean(), issues: z.array(z.string()) });
export const REVIEWERS = {
  accuracy: 'Check facts against Acme policy: refunds within 30 days, billing team approves refunds, rollbacks need no approval.',
  tone: 'Check the tone: polite, no blame, no jargon.',
  safety: 'Check that it makes no promises Acme cannot keep and leaks no internal data.',
} as const;

export async function parallelReview(draft: string, model: LanguageModel) {
  // One generateText per REVIEWERS entry with Output.object({ schema: ReviewSchema }), ALL started at once (Promise.all).
  // approved = at least 2 of 3 approve (decided in code). Return { approved, reviews: [{ name, approve, issues }], ms }.
  throw new Error('TODO: parallelReview');
}

// ---------- 3. Evaluator-optimizer: draft → critique → revise, with a hard cap on rounds ----------
export const VerdictSchema = z.object({ pass: z.boolean(), feedback: z.string() });

export async function evaluatorOptimizer(task: string, criteria: string, model: LanguageModel, maxRounds = 3) {
  // draft = generateText(task). Then up to maxRounds times:
  //   verdict = generateText(criteria + <draft>, Output.object({ schema: VerdictSchema })); push { draft, pass, feedback } to rounds
  //   stop if pass or this was the last round; otherwise revise: generateText(task + previous draft + feedback)
  // Return { final: last draft, passed: last pass, rounds }.
  throw new Error('TODO: evaluatorOptimizer');
}

// ---------- 4. Orchestrator-workers: plan subtasks dynamically, run workers in parallel, synthesise ----------
export const PlanSchema = z.object({
  subtasks: z.array(z.object({ title: z.string(), instructions: z.string() })).min(1).max(5),
});

export async function orchestratorWorkers(goal: string, model: LanguageModel) {
  // plan = generateText(goal, Output.object({ schema: PlanSchema }))
  // results = Promise.all(one worker call per subtask, with that subtask's instructions)
  // answer = one synthesis call over all results. Return { plan: plan.subtasks, results, answer }.
  throw new Error('TODO: orchestratorWorkers');
}
