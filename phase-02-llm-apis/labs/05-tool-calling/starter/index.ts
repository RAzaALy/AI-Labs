// Tool calling: the model ASKS for a function call; YOUR code decides whether and how to run it.
import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage } from 'ai';
import { z } from 'zod';
import { getModel } from '../../../../shared/llm.ts';

const defaultModel = () => getModel().model;

// ---------- Fake backend the tools talk to ----------
export const ORDERS: Record<string, { status: string; totalUSD: number; eta?: string }> = {
  'ORD-1001': { status: 'shipped', totalUSD: 129.99, eta: '2026-10-14' },
  'ORD-1002': { status: 'processing', totalUSD: 42.5 },
};
export const RATES_TO_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, PKR: 1 / 280 };

// ---------- Tool implementations (plain functions: testable without any LLM) ----------
export function getOrderStatus({ orderId }: { orderId: string }) {
  const order = ORDERS[orderId.toUpperCase()];
  if (!order) throw new Error(`Order ${orderId} not found. Ask the user to double-check the id.`);
  return { orderId: orderId.toUpperCase(), ...order };
}

export function convertCurrency({ amount, from, to }: { amount: number; from: string; to: string }) {
  const f = RATES_TO_USD[from.toUpperCase()];
  const t = RATES_TO_USD[to.toUpperCase()];
  if (!f || !t) throw new Error(`Unsupported currency. Supported: ${Object.keys(RATES_TO_USD).join(', ')}`);
  return { amount, from, to, converted: Math.round(((amount * f) / t) * 100) / 100 };
}

// ---------- Tool schemas: name + description + input schema is ALL the model ever sees ----------
export const toolSchemas = {
  getOrderStatus: tool({
    description: 'Look up an order by id (format ORD-1234). Returns status, total in USD and ETA if shipped.',
    inputSchema: z.object({ orderId: z.string().describe('Order id, e.g. ORD-1001') }),
  }),
  convertCurrency: tool({
    description: 'Convert an amount between currencies using today\'s rates. Supported: USD, EUR, GBP, PKR.',
    inputSchema: z.object({ amount: z.number(), from: z.string().length(3), to: z.string().length(3) }),
  }),
};

const executors: Record<string, (input: any) => unknown> = { getOrderStatus, convertCurrency };

export interface TraceEntry {
  step: number;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

const INSTRUCTIONS = 'You are an order-support assistant. Use tools for facts; never guess order data or exchange rates. Answer in one or two sentences.';

/**
 * Part A: the agent loop, by hand. Tools have NO execute function here, so the SDK just returns the
 * model's tool-call requests and we run them, append the results, and call the model again.
 */
export async function runManualToolLoop(question: string, model: LanguageModel = defaultModel(), maxSteps = 5) {
  // TODO: the agent loop by hand.
  //  messages = [{ role: 'user', content: question }]
  //  repeat up to maxSteps:
  //    r = await generateText({ model, instructions: INSTRUCTIONS, messages, tools: toolSchemas })   ← schemas only, no execute
  //    messages.push(...r.responseMessages)
  //    no r.toolCalls? → return { text: r.text, trace, messages, steps: step }
  //    for each call (in parallel): run executors[call.toolName](call.input); record a TraceEntry
  //      success → { type: 'tool-result', toolCallId, toolName, output: { type: 'json', value } }
  //      error   → same, but output: { type: 'error-text', value: message }   (send errors BACK to the model)
  //    messages.push({ role: 'tool', content: results })
  //  after maxSteps: throw an Error whose message contains `${maxSteps} steps`
  void executors; void INSTRUCTIONS;
  throw new Error('TODO: runManualToolLoop');
}

/** Part B: the same thing, letting the AI SDK run the loop. */
export async function runSdkToolLoop(question: string, model: LanguageModel = defaultModel()) {
  // TODO: generateText with tools that HAVE execute functions (wrap getOrderStatus / convertCurrency),
  //  stopWhen: isStepCount(5), and onStepEnd collecting 'tool-result' / 'tool-error' parts into `trace`.
  //  return { text: r.text, trace, steps: r.steps.length, usage: r.usage }
  void isStepCount;
  throw new Error('TODO: runSdkToolLoop');
}
