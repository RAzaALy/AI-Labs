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
// Docs: https://ai.google.dev/gemini-api/docs/text-generation
export function buildGeminiBody(req: ChatRequest) {
  // TODO: return { systemInstruction?, contents, generationConfig }
  //  - systemInstruction: { parts: [{ text }] } only when req.system is set
  //  - contents: [{ role: 'user' | 'model', parts: [{ text }] }]   ← assistant is called "model"
  //  - generationConfig: { temperature?, maxOutputTokens? } (omit undefined keys)
  throw new Error('TODO: buildGeminiBody');
}

export function parseGeminiResponse(json: any): ChatResult {
  // TODO: text = candidates[0].content.parts[*].text joined
  //  finishReason: 'STOP' → 'stop', 'MAX_TOKENS' → 'length', else 'other'
  //  usage: inputTokens = usageMetadata.promptTokenCount
  //         outputTokens = candidatesTokenCount + thoughtsTokenCount   (hidden thinking is billed as output!)
  //         reasoningTokens = thoughtsTokenCount ?? 0
  throw new Error('TODO: parseGeminiResponse');
}

// ---------- 2. OpenAI-compatible format ----------
export function buildOpenAIBody(req: ChatRequest, model: string) {
  // TODO: { model, messages: [system?, ...messages], temperature?, max_tokens? }
  throw new Error('TODO: buildOpenAIBody');
}

export function parseOpenAIResponse(json: any): ChatResult {
  // TODO: choices[0].message.content, finish_reason 'stop'|'length', usage.prompt_tokens / completion_tokens,
  //       reasoning = usage.completion_tokens_details?.reasoning_tokens ?? 0
  throw new Error('TODO: parseOpenAIResponse');
}

// ---------- 3. Transport (provided) ----------
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, text, parseRetryAfter(res.headers.get('retry-after')));
  return JSON.parse(text);
}
void postJson;

export async function callGemini(baseUrl: string, apiKey: string, model: string, req: ChatRequest): Promise<ChatResult> {
  // TODO: POST `${baseUrl}/v1beta/models/${model}:generateContent` with header x-goog-api-key (NOT ?key= in the URL)
  throw new Error('TODO: callGemini');
}

export async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, req: ChatRequest): Promise<ChatResult> {
  // TODO: POST `${baseUrl}/v1beta/openai/chat/completions` with header authorization: Bearer <key>
  throw new Error('TODO: callOpenAICompatible');
}

// ---------- 4. Retries ----------
export const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  // TODO:
  //  - defaults: retries 3, baseDelayMs 500, maxDelayMs 20_000, random Math.random, sleep = setTimeout promise
  //  - retry only HttpError with a RETRYABLE status (or a network TypeError); rethrow everything else immediately
  //  - delay = min(maxDelayMs, max(random() * baseDelayMs * 2 ** attempt, error.retryAfterMs ?? 0))   ← "full jitter"
  //  - call onRetry before sleeping; give up (rethrow) after `retries` retries
  throw new Error('TODO: withRetry');
}
