// Client-side request pacing as model middleware: every generate/stream call waits for a free slot.
// Free tiers enforce requests-per-minute (Gemini flash-lite: 15/min); an agent loop or an eval suite
// hits that in seconds, and SDK retries (2 s, 4 s...) give up long before the window resets.
import { wrapLanguageModel, type LanguageModel } from 'ai';
import type { LanguageModelV4 } from '@ai-sdk/provider';

const windows = new Map<string, number[]>(); // one sliding window per model id, shared by every caller in the process

async function acquire(key: string, rpm: number) {
  const sent = windows.get(key) ?? windows.set(key, []).get(key)!;
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0]! >= 60_000) sent.shift();
    if (sent.length < rpm) {
      sent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (now - sent[0]!) + 25));
  }
}

export function rateLimited(model: LanguageModelV4, rpm: number): LanguageModel {
  const key = `${model.provider}:${model.modelId}`;
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate }) => (await acquire(key, rpm), doGenerate()),
      wrapStream: async ({ doStream }) => (await acquire(key, rpm), doStream()),
    },
  });
}
