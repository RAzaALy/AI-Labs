// Streaming by hand: Server-Sent Events over fetch(), the way every LLM API streams tokens.
import { HttpError, buildGeminiBody, buildOpenAIBody, type ChatRequest } from '../../01-raw-http/solution/index.ts';

/**
 * Parse an SSE byte stream into the payload of each event's `data:` field(s).
 * Network chunks are arbitrary: a chunk can end mid-line, or even mid-UTF-8 character.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      // stream: true keeps a partial multi-byte character for the next chunk instead of emitting "�".
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + (buffer[nl] === '\r' ? 2 : 1));
        if (line === '') {
          // Blank line = end of one event.
          if (data.length) yield data.join('\n');
          data = [];
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        } // lines starting with ":" are comments/heartbeats; "event:", "id:", "retry:" are ignored here
      }
      if (done) {
        if (data.length) yield data.join('\n');
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface StreamResult {
  text: string;
  chunks: number;
  ttftMs: number; // time to first token: what the user perceives as "speed"
  totalMs: number;
  outputTokens: number;
  tokensPerSecond: number; // decode speed after the first token
  finishReason: string | undefined;
  aborted: boolean;
}

export interface StreamOptions {
  signal?: AbortSignal;
  onToken?: (delta: string) => void;
}

async function openStream(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new HttpError(res.status, await res.text());
  return res.body;
}

async function consume(events: AsyncGenerator<string>, extract: (payload: string) => { delta?: string; outputTokens?: number; finishReason?: string; done?: boolean }, started: number, opts: StreamOptions): Promise<StreamResult> {
  let text = '';
  let chunks = 0;
  let firstAt = 0;
  let outputTokens = 0;
  let finishReason: string | undefined;
  let aborted = false;
  try {
    for await (const payload of events) {
      const e = extract(payload);
      if (e.done) break;
      if (e.delta) {
        if (!firstAt) firstAt = performance.now();
        text += e.delta;
        chunks++;
        opts.onToken?.(e.delta);
      }
      if (e.outputTokens !== undefined) outputTokens = e.outputTokens;
      if (e.finishReason) finishReason = e.finishReason;
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
    aborted = true; // the user pressed "stop": keep what we have
  }
  const end = performance.now();
  const decodeSecs = firstAt ? (end - firstAt) / 1000 : 0;
  return {
    text,
    chunks,
    ttftMs: firstAt ? firstAt - started : NaN,
    totalMs: end - started,
    outputTokens,
    tokensPerSecond: decodeSecs > 0 ? outputTokens / decodeSecs : 0,
    finishReason,
    aborted,
  };
}

export async function streamGemini(baseUrl: string, apiKey: string, model: string, req: ChatRequest, opts: StreamOptions = {}): Promise<StreamResult> {
  const started = performance.now();
  const body = await openStream(`${baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse`, { 'x-goog-api-key': apiKey }, buildGeminiBody(req), opts.signal);
  return consume(
    parseSSE(body),
    (payload) => {
      const j = JSON.parse(payload);
      const cand = j.candidates?.[0];
      return {
        delta: (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join(''),
        // Gemini's usage is CUMULATIVE in every chunk: take the latest, don't add them up.
        outputTokens: j.usageMetadata ? (j.usageMetadata.candidatesTokenCount ?? 0) + (j.usageMetadata.thoughtsTokenCount ?? 0) : undefined,
        finishReason: cand?.finishReason,
      };
    },
    started,
    opts,
  );
}

export async function streamOpenAICompatible(baseUrl: string, apiKey: string, model: string, req: ChatRequest, opts: StreamOptions = {}): Promise<StreamResult> {
  const started = performance.now();
  const payload = { ...buildOpenAIBody(req, model), stream: true, stream_options: { include_usage: true } };
  const body = await openStream(`${baseUrl}/v1beta/openai/chat/completions`, { authorization: `Bearer ${apiKey}` }, payload, opts.signal);
  return consume(
    parseSSE(body),
    (p) => {
      if (p === '[DONE]') return { done: true }; // OpenAI's sentinel: not JSON
      const j = JSON.parse(p);
      return { delta: j.choices?.[0]?.delta?.content ?? undefined, outputTokens: j.usage?.completion_tokens, finishReason: j.choices?.[0]?.finish_reason ?? undefined };
    },
    started,
    opts,
  );
}
