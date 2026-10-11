// A deterministic stand-in for an LLM so the app (and its acceptance tests) run with no API key.
// It behaves like a tiny "intent router": order ids → getOrderStatus, "convert"/currency → convertCurrency,
// policy-ish questions → searchKnowledgeBase, ticket extraction → JSON, otherwise a short echo.
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type Prompt = { role: string; content: unknown }[];

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: any) => p.text ?? (p.output ? JSON.stringify(p.output.value ?? p.output) : '')).join(' ');
  return '';
}

type Decision = { kind: 'text'; text: string } | { kind: 'tool'; name: string; input: unknown };

function decide(prompt: Prompt): Decision {
  const last = prompt.at(-1);
  const system = textOf(prompt.find((m) => m.role === 'system')?.content);
  if (/support ticket/i.test(system)) {
    const convo = prompt.map((m) => textOf(m.content)).join(' ');
    const order = convo.match(/ORD-\d+/i)?.[0]?.toUpperCase() ?? null;
    return {
      kind: 'text',
      text: JSON.stringify({
        category: /charge|refund|bill|invoice/i.test(convo) ? 'billing' : /error|crash|broken|bug/i.test(convo) ? 'bug' : 'account',
        priority: /urgent|now|today|asap/i.test(convo) ? 'high' : 'medium',
        summary: `Customer conversation about ${order ?? 'their account'}.`.slice(0, 140),
        orderId: order,
        sentiment: /furious|angry|!!!/i.test(convo) ? 'angry' : 'neutral',
        actionItems: ['Review the conversation', 'Reply to the customer'],
      }),
    };
  }
  if (last?.role === 'tool') {
    const result = textOf(last.content);
    return { kind: 'text', text: `Here is what I found: ${result.slice(0, 240)}` };
  }
  const user = textOf(last?.content);
  const order = user.match(/ORD-\d+/i)?.[0];
  if (order) return { kind: 'tool', name: 'getOrderStatus', input: { orderId: order.toUpperCase() } };
  const conv = user.match(/(\d+(?:\.\d+)?)\s*(USD|EUR|GBP|PKR)\s+(?:to|in)\s+(USD|EUR|GBP|PKR)/i);
  if (conv) return { kind: 'tool', name: 'convertCurrency', input: { amount: Number(conv[1]), from: conv[2]!.toUpperCase(), to: conv[3]!.toUpperCase() } };
  if (/policy|how (do|long|often)|when|backup|rollback|roll back|rate limit|logs?|secret/i.test(user)) return { kind: 'tool', name: 'searchKnowledgeBase', input: { query: user } };
  return { kind: 'text', text: `[mock] You said: ${user.slice(0, 200)}` };
}

export function intentMockModel(): MockLanguageModelV4 {
  let callId = 0;
  const content = (d: Decision) =>
    d.kind === 'text' ? [{ type: 'text' as const, text: d.text }] : [{ type: 'tool-call' as const, toolCallId: `mock_${++callId}`, toolName: d.name, input: JSON.stringify(d.input) }];
  const tokens = (prompt: unknown) => Math.ceil(JSON.stringify(prompt).length / 4);
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const d = decide(prompt as Prompt);
      return { content: content(d), finishReason: { unified: d.kind === 'text' ? 'stop' : 'tool-calls', raw: undefined }, usage: usage(tokens(prompt), d.kind === 'text' ? Math.ceil(d.text.length / 4) : 15), warnings: [] };
    },
    doStream: async ({ prompt }) => {
      const d = decide(prompt as Prompt);
      const chunks: unknown[] = [];
      if (d.kind === 'text') {
        chunks.push({ type: 'text-start', id: 't1' });
        for (const piece of d.text.match(/\S+\s*/g) ?? []) chunks.push({ type: 'text-delta', id: 't1', delta: piece });
        chunks.push({ type: 'text-end', id: 't1' });
      } else {
        chunks.push(...content(d));
      }
      chunks.push({ type: 'finish', finishReason: { unified: d.kind === 'text' ? 'stop' : 'tool-calls', raw: undefined }, usage: usage(tokens(prompt), d.kind === 'text' ? Math.ceil(d.text.length / 4) : 15) });
      return { stream: simulateReadableStream({ chunks: chunks as never[], chunkDelayInMs: 15 }) };
    },
  });
}
