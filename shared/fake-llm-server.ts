// A tiny local stand-in for an LLM HTTP API, used by the raw-HTTP and streaming labs.
// It speaks two real wire formats:
//   • Gemini native:      POST /v1beta/models/{model}:generateContent
//                         POST /v1beta/models/{model}:streamGenerateContent?alt=sse
//   • OpenAI-compatible:  POST /v1beta/openai/chat/completions   (stream: true → SSE + [DONE])
// and lets tests inject failures (429 / 503 with Retry-After) to exercise retry logic.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_KEY = 'test-key';

export interface Fault {
  status: number;
  retryAfter?: string; // seconds, as the Retry-After header
}

export interface FakeServer {
  url: string;
  /** Faults consumed one per request, before normal handling. */
  faults: Fault[];
  /** Requests seen, for assertions. */
  requests: { path: string; body: any; headers: http.IncomingHttpHeaders }[];
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function reply(messages: { role: string; text: string }[], system?: string): string {
  const last = messages.filter((m) => m.role === 'user').at(-1)?.text ?? '';
  return `${system ? '(system acknowledged) ' : ''}Echo: ${last}`;
}

const tok = (s: string) => Math.max(1, Math.ceil(s.length / 4));

export async function startFakeLlmServer(opts: { chunkDelayMs?: number } = {}): Promise<FakeServer> {
  const state = { faults: [] as Fault[], requests: [] as FakeServer['requests'] };

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: any = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 400, message: 'Invalid JSON', status: 'INVALID_ARGUMENT' } }));
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    state.requests.push({ path: url.pathname, body, headers: req.headers });

    const fault = state.faults.shift();
    if (fault) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (fault.retryAfter !== undefined) headers['retry-after'] = fault.retryAfter;
      res.writeHead(fault.status, headers).end(JSON.stringify({ error: { code: fault.status, message: fault.status === 429 ? 'Resource exhausted (rate limit).' : 'The model is overloaded. Please try again later.', status: fault.status === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE' } }));
      return;
    }

    // ---------- Gemini native ----------
    const gem = url.pathname.match(/^\/v1beta\/models\/([^:]+):(generateContent|streamGenerateContent)$/);
    if (gem) {
      if (req.headers['x-goog-api-key'] !== FAKE_KEY) {
        res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 403, message: 'API key not valid.', status: 'PERMISSION_DENIED' } }));
        return;
      }
      const messages = (body.contents ?? []).map((c: any) => ({ role: c.role, text: (c.parts ?? []).map((p: any) => p.text ?? '').join('') }));
      const system = body.systemInstruction?.parts?.map((p: any) => p.text).join('');
      const text = reply(messages, system);
      const promptTokens = tok(JSON.stringify(body.contents ?? []) + (system ?? ''));
      const maxOut = body.generationConfig?.maxOutputTokens;
      const truncated = maxOut !== undefined && tok(text) > maxOut;
      const finalText = truncated ? text.slice(0, maxOut * 4) : text;
      const usageMetadata = (n: number) => ({ promptTokenCount: promptTokens, candidatesTokenCount: n, totalTokenCount: promptTokens + n });

      if (gem[2] === 'generateContent') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            candidates: [{ content: { role: 'model', parts: [{ text: finalText }] }, finishReason: truncated ? 'MAX_TOKENS' : 'STOP', index: 0 }],
            usageMetadata: usageMetadata(tok(finalText)),
            modelVersion: gem[1],
          }),
        );
        return;
      }
      // SSE: one JSON object per `data:` line, usage is cumulative, last chunk carries finishReason.
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const pieces = finalText.match(/\S+\s*/g) ?? [finalText];
      let sent = '';
      for (const [i, piece] of pieces.entries()) {
        if (res.destroyed) return; // client aborted
        sent += piece;
        const last = i === pieces.length - 1;
        res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: piece }] }, index: 0, ...(last ? { finishReason: truncated ? 'MAX_TOKENS' : 'STOP' } : {}) }], usageMetadata: usageMetadata(tok(sent)) })}\r\n\r\n`);
        await sleep(opts.chunkDelayMs ?? 5);
      }
      res.end();
      return;
    }

    // ---------- OpenAI-compatible ----------
    if (url.pathname === '/v1beta/openai/chat/completions') {
      if (req.headers.authorization !== `Bearer ${FAKE_KEY}`) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Incorrect API key provided.', type: 'invalid_request_error' } }));
        return;
      }
      const msgs = (body.messages ?? []).map((m: any) => ({ role: m.role, text: typeof m.content === 'string' ? m.content : '' }));
      const system = msgs.find((m: any) => m.role === 'system')?.text;
      const text = reply(msgs.filter((m: any) => m.role !== 'system'), system);
      const promptTokens = tok(JSON.stringify(body.messages ?? []));
      const maxOut = body.max_tokens ?? body.max_completion_tokens;
      const truncated = maxOut !== undefined && tok(text) > maxOut;
      const finalText = truncated ? text.slice(0, maxOut * 4) : text;
      const usage = { prompt_tokens: promptTokens, completion_tokens: tok(finalText), total_tokens: promptTokens + tok(finalText) };
      const finish = truncated ? 'length' : 'stop';
      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: finalText }, finish_reason: finish }], usage }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const piece of finalText.match(/\S+\s*/g) ?? [finalText]) {
        if (res.destroyed) return;
        res.write(`data: ${JSON.stringify({ object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
        await sleep(opts.chunkDelayMs ?? 5);
      }
      res.write(`data: ${JSON.stringify({ object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: finish }], usage })}\n\n`);
      res.end('data: [DONE]\n\n');
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 404, message: `No route ${url.pathname}` } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    get faults() {
      return state.faults;
    },
    set faults(f) {
      state.faults = f;
    },
    requests: state.requests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
