// Connect a real MCP Client to a server factory without a port or a child process: the client's HTTP transport
// gets a `fetch` that calls the handler directly. Every byte still goes through the 2026-07-28 Streamable HTTP
// code path (headers, _meta envelope, JSON-RPC), so this is how the checks test servers fast and deterministically.
import { createMcpHandler, type AuthInfo, type McpServer } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export type Factory = (ctx: { authInfo?: AuthInfo }) => McpServer;
export type Elicit = (params: { message: string; requestedSchema?: unknown }) => Promise<{ action: 'accept' | 'decline' | 'cancel'; content?: Record<string, string | number | boolean | string[]> }>;

export interface WireEntry {
  method: string;
  name?: string;
  body: string;
  status: number;
}

export async function connectInProcess(factory: Factory, opts: { authInfo?: AuthInfo; elicit?: Elicit; clientName?: string } = {}) {
  const handler = createMcpHandler(factory);
  const wire: WireEntry[] = [];
  const url = new URL('http://localhost/mcp');
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const body = req.method === 'POST' ? await req.clone().text() : '';
    const res = await handler.fetch(req, { authInfo: opts.authInfo });
    wire.push({ method: req.headers.get('mcp-method') ?? req.method, name: req.headers.get('mcp-name') ?? undefined, body, status: res.status });
    return res;
  };
  const client = new Client(
    { name: opts.clientName ?? 'in-process-test', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' }, capabilities: opts.elicit ? { elicitation: { form: {} } } : {} },
  );
  if (opts.elicit) client.setRequestHandler('elicitation/create', async (req) => opts.elicit!(req.params as never));
  await client.connect(new StreamableHTTPClientTransport(url, { fetch: fetchFn as typeof fetch }));
  /** Send a raw JSON-RPC tools/call, exactly as any HTTP client could (used to test what a hostile client can do). */
  const rawCall = async (name: string, params: Record<string, unknown>) => {
    const body = { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': { elicitation: { form: {} } } } } };
    const res = await handler.fetch(
      new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': name }, body: JSON.stringify(body) }),
      { authInfo: opts.authInfo },
    );
    const text = await res.text();
    const json = text.trim().startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').filter((l) => l.startsWith('data:')).at(-1)!.slice(5));
    return json as { result?: Record<string, any>; error?: { code: number; message: string } };
  };
  return { client, wire, rawCall, close: () => client.close() };
}

export const textOf = (r: { content?: unknown }) => ((r.content as { type: string; text?: string }[] | undefined) ?? []).map((c) => c.text ?? '').join('\n');
