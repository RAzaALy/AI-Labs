// Streaming by hand: Server-Sent Events over fetch(), the way every LLM API streams tokens.
// Lab 01's request builders are imported from its solution so this lab stands on its own.
import { HttpError, buildGeminiBody, buildOpenAIBody, type ChatRequest } from '../../01-raw-http/solution/index.ts';

/**
 * Parse an SSE byte stream into the payload of each event's `data:` field(s).
 * Network chunks are arbitrary: a chunk can end mid-line, or even mid-UTF-8 character.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  // TODO: yield the payload of each SSE event.
  //  - read with body.getReader(); decode with ONE TextDecoder using decode(value, { stream: true })
  //    (a chunk can end in the middle of a multi-byte character)
  //  - keep a string buffer; split complete lines on \n or \r\n; keep the incomplete tail for the next chunk
  //  - "data: x" lines accumulate (strip "data:" and ONE optional space); several data lines join with "\n"
  //  - a blank line ends the event → yield the joined data (if any)
  //  - ignore comment lines (":...") and other fields ("event:", "id:")
  //  - when the stream ends, flush a pending event
  throw new Error('TODO: parseSSE');
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

// TODO (after parseSSE): read consume() above. It is provided, so you can see how TTFT and tokens/s are measured.

export async function streamGemini(baseUrl: string, apiKey: string, model: string, req: ChatRequest, opts: StreamOptions = {}): Promise<StreamResult> {
  // TODO: open `${baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse` (header x-goog-api-key)
  //  and pass consume() an extractor for each JSON payload:
  //   delta = candidates[0].content.parts[*].text, finishReason = candidates[0].finishReason,
  //   outputTokens = usageMetadata.candidatesTokenCount + thoughtsTokenCount   (cumulative: take the latest!)
  void openStream; void consume; void buildGeminiBody;
  throw new Error('TODO: streamGemini');
}

export async function streamOpenAICompatible(baseUrl: string, apiKey: string, model: string, req: ChatRequest, opts: StreamOptions = {}): Promise<StreamResult> {
  // TODO: body = { ...buildOpenAIBody(req, model), stream: true, stream_options: { include_usage: true } }
  //  POST `${baseUrl}/v1beta/openai/chat/completions` (Bearer auth). Extractor:
  //   "[DONE]" → { done: true } (not JSON!), delta = choices[0].delta.content,
  //   outputTokens = usage?.completion_tokens, finishReason = choices[0].finish_reason
  void buildOpenAIBody;
  throw new Error('TODO: streamOpenAICompatible');
}
