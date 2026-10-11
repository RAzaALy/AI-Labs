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
  // TODO: read the PNG bytes; generateText with output: Output.object({ schema: ChartReading }) and
  //  messages: [{ role: 'user', content: [ { type: 'text', text: '…' }, { type: 'file', mediaType: 'image/png', data: bytes } ] }]
  //  temperature 0. Return { reading: r.output, usage: r.usage }
  void readFile; void generateText; void Output;
  throw new Error('TODO: readChart');
}

export const InvoiceFields = z.object({
  invoiceNumber: z.string(),
  vendor: z.string(),
  total: z.number().describe('Total amount due as a number, no currency symbol or thousands separator'),
  currency: z.string().length(3).describe('ISO 4217 code'),
  dueDate: z.string().describe('YYYY-MM-DD'),
});

export async function extractInvoice(pdfPath: string, model: LanguageModel = defaultModel()) {
  // TODO: same pattern with InvoiceFields and a file part { type: 'file', mediaType: 'application/pdf', data, filename }
  throw new Error('TODO: extractInvoice');
}

/** How many input tokens did attaching the file cost? Compare against a text-only baseline. */
export async function measureAttachmentTokens(pngPath: string, model: LanguageModel = defaultModel()) {
  // TODO: run the SAME short prompt twice (maxOutputTokens 20): once text-only, once with the PNG attached.
  //  return { textOnly: inputTokens, withImage: inputTokens }
  throw new Error('TODO: measureAttachmentTokens');
}
