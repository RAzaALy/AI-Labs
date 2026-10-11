// Structured output: make the model return data your code can trust, validated by a schema.
import { generateText, NoObjectGeneratedError, Output, streamText, type LanguageModel } from 'ai';
import { z } from 'zod';
import { getModel } from '../../../../shared/llm.ts';

const defaultModel = () => getModel().model;

// ---------- 1. The schema IS the prompt ----------
// Field names, enums and .describe() text are sent to the model. Write them like docs for a junior engineer.
export const LABELS = ['billing', 'bug', 'feature_request', 'account'] as const;

// TODO: define the schema. Fields (see check.ts for the exact expectations):
//   category: enum LABELS · priority: enum low|medium|high|urgent (add a .describe() that DEFINES each level)
//   summary: string, max 140 · customer: { name: string|null, email: string|null }
//   orderId: string|null (describe: "never invent one") · sentiment: enum positive|neutral|frustrated|angry
//   actionItems: string[] with max 3
export const TicketSchema = z.object({
  category: z.enum(LABELS),
  // ...
});
export type Ticket = z.infer<typeof TicketSchema>;

const INSTRUCTIONS = 'Extract a support ticket from the customer email. Use null for anything not stated. Never invent ids, names or emails.';

export async function extractTicket(email: string, model: LanguageModel = defaultModel()) {
  // TODO: generateText({ model, instructions: INSTRUCTIONS, prompt: email,
  //   output: Output.object({ schema: TicketSchema, name: 'support_ticket', description: '...' }), temperature: 0 })
  //  return { ticket: r.output, usage: r.usage }
  void generateText; void Output;
  throw new Error('TODO: extractTicket');
}

// ---------- 2. Classification without parsing free text ----------
export async function classifyChoice(ticket: string, model: LanguageModel = defaultModel()) {
  // TODO: same call shape with output: Output.choice({ options: [...LABELS] }); return r.output
  throw new Error('TODO: classifyChoice');
}

// ---------- 3. When validation fails: repair, don't crash ----------
export async function extractWithRepair(email: string, model: LanguageModel = defaultModel(), maxAttempts = 2) {
  // TODO: loop up to maxAttempts:
  //   try the extraction; on NoObjectGeneratedError.isInstance(err) append a <previous_attempt_error>…</previous_attempt_error>
  //   block (containing the error message, which must include the word "previous") to the prompt and try again.
  //   Rethrow other errors, or after the last attempt. Return { ticket, attempts }.
  void NoObjectGeneratedError;
  throw new Error('TODO: extractWithRepair');
}

// ---------- 4. Stream partial objects for a responsive UI ----------
export async function streamTicket(email: string, onPartial: (p: unknown) => void, model: LanguageModel = defaultModel()) {
  // TODO: result = streamText({ model, instructions: INSTRUCTIONS, prompt: email, output: Output.object({ schema: TicketSchema }) })
  //  for await (const partial of result.partialOutputStream) { count it; onPartial(partial) }
  //  return { ticket: await result.output, partials }
  void streamText;
  throw new Error('TODO: streamTicket');
}

// ---------- 5. Arrays ----------
export const LineItem = z.object({ description: z.string(), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative() });

export async function extractLineItems(invoiceText: string, model: LanguageModel = defaultModel()) {
  // TODO: output: Output.array({ element: LineItem }); compute total = Σ quantity × unitPrice IN CODE
  throw new Error('TODO: extractLineItems');
}
