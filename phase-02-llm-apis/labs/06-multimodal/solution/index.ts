// Multimodal input: images and PDFs are just more content parts in a user message (and more input tokens).
import { readFile } from 'node:fs/promises';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import { getModel } from '../../../../shared/llm.ts';

const defaultModel = () => getModel().model;

export const ChartReading = z.object({
  barCount: z.number().int(),
  colorsLeftToRight: z.array(z.enum(['red', 'blue', 'green', 'orange', 'purple', 'yellow', 'other'])),
  tallestColor: z.enum(['red', 'blue', 'green', 'orange', 'purple', 'yellow', 'other']),
});

export async function readChart(pngPath: string, model: LanguageModel = defaultModel()) {
  const image = await readFile(pngPath);
  const r = await generateText({
    model,
    output: Output.object({ schema: ChartReading }),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read this bar chart. Report the number of bars, their colours from left to right, and which bar is tallest.' },
          // v7: images are `file` parts with an image media type (the old `image` part is deprecated)
          { type: 'file', mediaType: 'image/png', data: image },
        ],
      },
    ],
    temperature: 0,
  });
  return { reading: r.output, usage: r.usage };
}

export const InvoiceFields = z.object({
  invoiceNumber: z.string(),
  vendor: z.string(),
  total: z.number().describe('Total amount due as a number, no currency symbol or thousands separator'),
  currency: z.string().length(3).describe('ISO 4217 code'),
  dueDate: z.string().describe('YYYY-MM-DD'),
});

export async function extractInvoice(pdfPath: string, model: LanguageModel = defaultModel()) {
  const pdf = await readFile(pdfPath);
  const r = await generateText({
    model,
    output: Output.object({ schema: InvoiceFields }),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the invoice fields from this PDF.' },
          { type: 'file', mediaType: 'application/pdf', data: pdf, filename: 'invoice.pdf' },
        ],
      },
    ],
    temperature: 0,
  });
  return { invoice: r.output, usage: r.usage };
}

/** How many input tokens did attaching the file cost? Compare against a text-only baseline. */
export async function measureAttachmentTokens(pngPath: string, model: LanguageModel = defaultModel()) {
  const prompt = 'Describe this in five words.';
  const textOnly = await generateText({ model, prompt, maxOutputTokens: 20 });
  const withImage = await generateText({
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'file', mediaType: 'image/png', data: await readFile(pngPath) }] }],
    maxOutputTokens: 20,
  });
  return { textOnly: textOnly.usage.inputTokens ?? 0, withImage: withImage.usage.inputTokens ?? 0 };
}
