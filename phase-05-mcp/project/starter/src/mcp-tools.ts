// The host side: connect to the Acme MCP server over HTTP with a token, answer approval requests through a PERSON,
// and turn the server's tools into model tools (Lab 02's adapter: tool errors are thrown, so the model sees them as errors).
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export type Approver = (question: string) => Promise<boolean>;

export async function connectHttp(url: URL, token: string, approver: Approver): Promise<Client> {
  const client = new Client({ name: 'acme-agent-cli', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' }, capabilities: { elicitation: { form: {} } } });
  // The server's input_required rounds land here. The answer comes from a person, never from the model.
  client.setRequestHandler('elicitation/create', async (req) => {
    const ok = await approver(String((req.params as { message?: string }).message ?? ''));
    return ok ? { action: 'accept', content: { approve: true } } : { action: 'decline' };
  });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}

const textOf = (r: { content?: unknown }) => ((r.content as { text?: string }[] | undefined) ?? []).map((c) => c.text ?? '').join('\n');

export async function mcpTools(client: Client): Promise<ToolSet> {
  const { tools } = await client.listTools();
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      dynamicTool({
        description: t.description ?? t.name,
        inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: async (args) => {
          const r = await client.callTool({ name: t.name, arguments: args as Record<string, unknown> });
          if (r.isError) throw new Error(textOf(r));
          return r.structuredContent ?? textOf(r);
        },
      }),
    ]),
  );
}
