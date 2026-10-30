// A deterministic stand-in for the agent's model (Phase 4's, adapted to this server's result shapes), so the agent
// CLI and its acceptance test run with no API key. It reads the conversation and picks the next tool call or answer.
import { MockLanguageModelV4 } from 'ai/test';

type Part = { type: string; text?: string; toolName?: string; output?: { type: string; value?: unknown } };
type Msg = { role: string; content: string | Part[] };
type Next = { text: string } | { tool: string; input: Record<string, unknown> };

export function decide(prompt: Msg[]): Next {
  const lastUser = prompt.map((m) => m.role).lastIndexOf('user');
  const m = prompt[lastUser];
  const user = (typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p) => p.text ?? '').join(' ')).toLowerCase();
  const results = prompt.slice(lastUser + 1).flatMap((x) => (x.role === 'tool' && Array.isArray(x.content) ? x.content.filter((p) => p.type === 'tool-result') : []));
  const ran = (t: string) => results.find((r) => r.toolName === t)?.output;
  const last = results.at(-1)?.output;
  if (last?.type.startsWith('error')) return { text: `I could not complete that: ${String(last.value).slice(0, 240)}` };
  const val = (t: string) => ran(t)?.value as any;

  if (/\b(api|web|worker)\b/.test(user) && !/refund/.test(user)) {
    const service = /\bweb\b/.test(user) ? 'web' : /worker/.test(user) ? 'worker' : 'api';
    if (!ran('getDeployStatus')) return { tool: 'getDeployStatus', input: { service } };
    const s = val('getDeployStatus');
    if (s.status === 'degraded' && !ran('rollback')) return { tool: 'rollback', input: { service } };
    if (ran('rollback') && !ran('createTicket')) return { tool: 'createTicket', input: { subject: `Post-incident review: ${service} rollback`, body: `${service} ${s.version} was degraded (${s.errorRatePct}% errors); rolled back to ${s.previousVersion}.`, priority: 'high' } };
    return { text: ran('rollback') ? `${service} was degraded; I rolled it back to ${s.previousVersion} and opened ${val('createTicket').ticketId} for the post-incident review.` : `${service} is ${s.status}, so I changed nothing.` };
  }
  if (/refund/.test(user)) {
    if (!ran('findCustomers')) return { tool: 'findCustomers', input: { query: /bilal/.test(user) ? 'Bilal' : 'Ayesha' } };
    const customer = val('findCustomers').customers[0];
    if (!ran('listInvoices')) return { tool: 'listInvoices', input: { customerId: customer.id } };
    const r = val('issueRefund');
    if (r) return { text: r.refunded ? `Refund ${r.refundId} issued: USD ${r.amountUSD} on ${r.invoiceId}.` : 'The billing approver declined, so nothing was refunded.' };
    const inv = (val('listInvoices').invoices as { id: string; refundableUSD: number }[]).find((i) => i.refundableUSD > 0)!;
    return { tool: 'issueRefund', input: { invoiceId: inv.id, amountUSD: inv.refundableUSD, reason: 'Customer asked for a refund of this charge' } };
  }
  return { text: 'I can check deploys, roll back degraded services, look up customers and invoices, refund (with approval) and open tickets.' };
}

export function mockAgentModel(): MockLanguageModelV4 {
  let id = 0;
  const usage = (n: number) => ({ inputTokens: { total: n, noCache: n, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 30, text: 30, reasoning: undefined } });
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const n = decide(prompt as unknown as Msg[]);
      return {
        content: 'text' in n ? [{ type: 'text', text: n.text }] : [{ type: 'tool-call', toolCallId: `mock_${++id}`, toolName: n.tool, input: JSON.stringify(n.input) }],
        finishReason: { unified: 'text' in n ? 'stop' : 'tool-calls', raw: undefined },
        usage: usage(Math.ceil(JSON.stringify(prompt).length / 4)),
        warnings: [],
      };
    },
  });
}
