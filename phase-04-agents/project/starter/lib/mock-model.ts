// A deterministic stand-in for the agent's LLM, so the app and its acceptance tests run with no API key.
// It reads the conversation like a (very literal) agent: what the user asked, which tools already ran
// this turn and what they returned, and picks the next tool call or the final answer.
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type Part = { type: string; text?: string; toolName?: string; output?: { type: string; value?: unknown } };
type Msg = { role: string; content: string | Part[] };
type Result = { tool: string; kind: string; value: any };
type Next = { text: string } | { tool: string; input: Record<string, unknown> };

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

function turn(prompt: Msg[]): { user: string; results: Result[] } {
  const lastUser = prompt.map((m) => m.role).lastIndexOf('user');
  const m = prompt[lastUser];
  const user = typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p) => p.text ?? '').join(' ');
  const results = prompt.slice(lastUser + 1).flatMap((x) => (x.role === 'tool' && Array.isArray(x.content) ? x.content.filter((p) => p.type === 'tool-result').map((p) => ({ tool: p.toolName!, kind: p.output?.type ?? 'json', value: p.output?.value })) : []));
  return { user, results };
}

export function decide(prompt: Msg[]): Next {
  const { user, results } = turn(prompt);
  const u = user.toLowerCase();
  const last = results.at(-1);
  const ran = (t: string) => results.find((r) => r.tool === t);
  if (last?.kind === 'execution-denied') {
    if (!ran('createTicket')) return { tool: 'createTicket', input: { subject: 'Refund needs manual billing review', body: `Denied in chat: ${user.slice(0, 200)}`, priority: 'normal' } };
    return { text: 'The billing team declined the refund in chat, so I did not issue it. I opened a ticket for a manual review.' };
  }
  if (last && last.kind.startsWith('error')) return { text: `I could not complete that: ${String(last.value).slice(0, 240)}` };

  // A question about policy is a lookup, not an action: "what is our refund policy?" must not refund anything.
  const asksForAction = /\b(fix|investigate|roll (it )?back|refund it|please refund|charged twice)\b/.test(u);
  if (!asksForAction && /^(what|how|when|which|who|is|are|do|does|can)\b|\bpolicy\b/.test(u)) {
    const hit = ran('searchHandbook');
    if (!hit) return { tool: 'searchHandbook', input: { query: user } };
    const top = Array.isArray(hit.value) ? hit.value[0] : undefined;
    return { text: top ? `From ${top.source}: ${String(top.excerpt).split('\n')[0]!.slice(0, 220)}` : 'The handbook has nothing on that.' };
  }
  if (/loop forever/.test(u)) return { tool: 'getDeployStatus', input: { service: 'web' } }; // test hook: never finishes
  if (/\b(api|web|worker|outage|errors?|down|slow|roll)/.test(u) && !/refund|charged/.test(u)) {
    const service = /\bweb\b/.test(u) ? 'web' : /worker/.test(u) ? 'worker' : 'api';
    const status = ran('getDeployStatus');
    if (!status) return { tool: 'getDeployStatus', input: { service } };
    if (status.value?.status === 'degraded' && !ran('rollback')) return { tool: 'rollback', input: { service } };
    if (ran('rollback') && !ran('createTicket')) return { tool: 'createTicket', input: { subject: `Post-incident review: ${service} rollback`, body: `${service} ${status.value.version} was degraded (${status.value.errorRatePct}% errors); rolled back to ${status.value.previousVersion}.`, priority: 'high' } };
    return { text: ran('rollback') ? `${service} was degraded (${status.value.errorRatePct}% errors). I rolled it back to ${status.value.previousVersion} and opened a post-incident review ticket.` : `${service} is ${status.value?.status} (${status.value?.errorRatePct}% errors), so I did not roll it back. The slowness is probably specific to that customer: worth a support ticket.` };
  }
  if (/refund|charged twice|duplicate/.test(u)) {
    const who = /bilal/.test(u) ? 'Bilal' : /northwind/.test(u) ? 'Northwind' : 'Ayesha';
    const found = ran('findCustomers');
    if (!found) return { tool: 'findCustomers', input: { query: who } };
    const customer = found.value?.[0];
    if (!customer) return { text: `I could not find a customer matching "${who}".` };
    const invoices = ran('listInvoices');
    if (!invoices) return { tool: 'listInvoices', input: { customerId: customer.id } };
    const refund = ran('issueRefund');
    if (refund) return { text: `Refund ${refund.value.refundId} issued: USD ${refund.value.amountUSD} on ${refund.value.invoiceId}.` };
    const list = invoices.value as { id: string; amountUSD: number; refundableUSD: number; date: string }[];
    const dup = /charged twice|duplicate/.test(u);
    const target = /september/.test(u) ? list.find((i) => i.date.startsWith('2026-09')) : dup ? list[0] : list.find((i) => i.refundableUSD > 0);
    if (!target) return { text: 'There is no refundable invoice for this customer.' };
    return { tool: 'issueRefund', input: { invoiceId: target.id, amountUSD: target.refundableUSD || target.amountUSD, reason: dup ? 'Duplicate charge' : 'Customer reports the charge was a mistake', ...(dup ? { billingError: true } : {}) } };
  }
  return { text: 'I can investigate deploys, roll back degraded services, look up customers and invoices, refund (with billing approval) and open tickets. What do you need?' };
}

export function mockOpsAgentModel(): MockLanguageModelV4 {
  let id = 0;
  const tokens = (prompt: unknown) => Math.ceil(JSON.stringify(prompt).length / 4);
  const content = (n: Next) => ('text' in n ? [{ type: 'text' as const, text: n.text }] : [{ type: 'tool-call' as const, toolCallId: `mock_${Date.now().toString(36)}_${++id}`, toolName: n.tool, input: JSON.stringify(n.input) }]);
  const finish = (n: Next) => ({ unified: ('text' in n ? 'stop' : 'tool-calls') as 'stop' | 'tool-calls', raw: undefined });
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const n = decide(prompt as unknown as Msg[]);
      return { content: content(n), finishReason: finish(n), usage: usage(tokens(prompt), 30), warnings: [] };
    },
    doStream: async ({ prompt }) => {
      const n = decide(prompt as unknown as Msg[]);
      const chunks: unknown[] = [];
      if ('text' in n) {
        chunks.push({ type: 'text-start', id: 't1' });
        for (const piece of n.text.match(/\S+\s*/g) ?? []) chunks.push({ type: 'text-delta', id: 't1', delta: piece });
        chunks.push({ type: 'text-end', id: 't1' });
      } else chunks.push(...content(n));
      chunks.push({ type: 'finish', finishReason: finish(n), usage: usage(tokens(prompt), 30) });
      return { stream: simulateReadableStream({ chunks: chunks as never[], chunkDelayInMs: 5 }) };
    },
  });
}
