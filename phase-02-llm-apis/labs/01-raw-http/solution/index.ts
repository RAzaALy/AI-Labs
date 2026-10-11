// Calling an LLM with nothing but fetch(), in two wire formats. No SDK, so you see exactly what crosses the network.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

/** Provider-neutral result: what every SDK eventually normalizes to. */
export interface ChatResult {
  text: string;
  finishReason: 'stop' | 'length' | 'other';
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    public retryAfterMs?: number,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

// ---------- 1. Gemini native format ----------

export function buildGeminiBody(req: ChatRequest) {
  return {
    // Gemini calls the assistant role "model", and system instructions live OUTSIDE the message list.
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: {
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxOutputTokens !== undefined ? { maxOutputTokens: req.maxOutputTokens } : {}),
    },
  };
}

export function parseGeminiResponse(json: any): ChatResult {
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  const reason = cand?.finishReason;
  return {
    text,
    finishReason: reason === 'STOP' ? 'stop' : reason === 'MAX_TOKENS' ? 'length' : 'other',
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      // Gemini reports visible output and hidden thinking separately; both are billed as output.
      outputTokens: (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0),
      reasoningTokens: json.usageMetadata?.thoughtsTokenCount ?? 0,
    },
  };
}

// ---------- 2. OpenAI-compatible format (also spoken by Groq, OpenRouter, Ollama, vLLM, and Gemini's /openai endpoint) ----------

export function buildOpenAIBody(req: ChatRequest, model: string) {
  return {
    model,
    // System prompt is just the first message, with role "system".
    messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxOutputTokens !== undefined ? { max_tokens: req.maxOutputTokens } : {}),
  };
}

export function parseOpenAIResponse(json: any): ChatResult {
  const choice = json.choices?.[0];
  const reason = choice?.finish_reason;
  return {
    text: choice?.message?.content ?? '',
    finishReason: reason === 'stop' ? 'stop' : reason === 'length' ? 'length' : 'other',
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    },
  };
}

// ---------- 3. Transport with proper errors ----------

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(header); // HTTP-date form
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, text, parseRetryAfter(res.headers.get('retry-after')));
  return JSON.parse(text);
}

export async function callGemini(baseUrl: string, apiKey: string, model: string, req: ChatRequest): Promise<ChatResult> {
  // The key goes in a header, never in the URL: URLs end up in logs, proxies and browser history.
  const json = await postJson(`${baseUrl}/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': apiKey }, buildGeminiBody(req));
  return parseGeminiResponse(json);
}

export async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, req: ChatRequest): Promise<ChatResult> {
  const json = await postJson(`${baseUrl}/v1beta/openai/chat/completions`, { authorization: `Bearer ${apiKey}` }, buildOpenAIBody(req, model));
  return parseOpenAIResponse(json);
}

// ---------- 4. Retries: exponential backoff + full jitter, honouring Retry-After ----------

export const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 20_000, random = Math.random } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof HttpError ? RETRYABLE.has(error.status) : error instanceof TypeError; // TypeError = network failure in fetch
      if (!retryable || attempt >= retries) throw error;
      // Full jitter: random in [0, base·2^attempt], so many clients don't retry in lockstep (thundering herd).
      const backoff = Math.min(maxDelayMs, random() * baseDelayMs * 2 ** attempt);
      const serverHint = error instanceof HttpError ? error.retryAfterMs : undefined;
      const delayMs = Math.min(maxDelayMs, Math.max(backoff, serverHint ?? 0));
      opts.onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
}
