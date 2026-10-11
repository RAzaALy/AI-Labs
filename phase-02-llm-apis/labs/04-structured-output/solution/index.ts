// Structured output: make the model return data your code can trust, validated by a schema.
import { generateText, NoObjectGeneratedError, Output, streamText, type LanguageModel } from 'ai';
import { z } from 'zod';
import { getModel } from '../../../../shared/llm.ts';

const defaultModel = () => getModel().model;

// ---------- 1. The schema IS the prompt ----------
// Field names, enums and .describe() text are sent to the model. Write them like docs for a junior engineer.
export const LABELS = ['billing', 'bug', 'feature_request', 'account'] as const;

export const TicketSchema = z.object({
  category: z.enum(LABELS),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('urgent = outage or money lost right now; high = blocked; medium = degraded; low = question/idea'),
  summary: z.string().max(140).describe('One sentence, written for the on-call engineer'),
  customer: z.object({
    name: z.string().nullable().describe('null if not stated'),
    email: z.string().nullable().describe('null if not stated'),
  }),
  orderId: z.string().nullable().describe('Order id like ORD-12345, or null. Never invent one.'),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  actionItems: z.array(z.string()).max(3).describe('Concrete next steps for support, at most 3'),
});
export type Ticket = z.infer<typeof TicketSchema>;

const INSTRUCTIONS = 'Extract a support ticket from the customer email. Use null for anything not stated. Never invent ids, names or emails.';

export async function extractTicket(email: string, model: LanguageModel = defaultModel()) {
  const r = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt: email,
    output: Output.object({ schema: TicketSchema, name: 'support_ticket', description: 'A triaged support ticket' }),
    temperature: 0,
  });
  return { ticket: r.output, usage: r.usage };
}

// ---------- 2. Classification without parsing free text ----------
export async function classifyChoice(ticket: string, model: LanguageModel = defaultModel()) {
  const r = await generateText({
    model,
    instructions: 'Classify the support ticket.',
    prompt: ticket,
    output: Output.choice({ options: [...LABELS] }),
    temperature: 0,
  });
  return r.output;
}

// ---------- 3. When validation fails: repair, don't crash ----------
export async function extractWithRepair(email: string, model: LanguageModel = defaultModel(), maxAttempts = 2) {
  let feedback = '';
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await generateText({
        model,
        instructions: INSTRUCTIONS,
        prompt: email + feedback,
        output: Output.object({ schema: TicketSchema }),
        temperature: 0,
      });
      return { ticket: r.output, attempts: attempt };
    } catch (err) {
      if (!NoObjectGeneratedError.isInstance(err) || attempt >= maxAttempts) throw err;
      // Feed the validation error back: models are good at fixing a specific complaint.
      feedback = `\n\n<previous_attempt_error>Your previous output was invalid: ${String((err.cause as Error | undefined)?.message ?? err.message).slice(0, 500)}. Return valid JSON matching the schema.</previous_attempt_error>`;
    }
  }
}

// ---------- 4. Stream partial objects for a responsive UI ----------
export async function streamTicket(email: string, onPartial: (p: unknown) => void, model: LanguageModel = defaultModel()) {
  const result = streamText({ model, instructions: INSTRUCTIONS, prompt: email, output: Output.object({ schema: TicketSchema }) });
  let partials = 0;
  for await (const partial of result.partialOutputStream) {
    partials++;
    onPartial(partial); // NOT validated yet: fields may be missing or half-written
  }
  return { ticket: await result.output, partials };
}

// ---------- 5. Arrays ----------
export const LineItem = z.object({ description: z.string(), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative() });

export async function extractLineItems(invoiceText: string, model: LanguageModel = defaultModel()) {
  const r = await generateText({
    model,
    instructions: 'Extract every line item from the invoice. Prices are numbers without currency symbols.',
    prompt: invoiceText,
    output: Output.array({ element: LineItem }),
    temperature: 0,
  });
  const total = r.output.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return { items: r.output, total };
}
