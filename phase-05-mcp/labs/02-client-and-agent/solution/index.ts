// Lab 02: the other side of the protocol. A HOST (your app) runs one MCP CLIENT per server, turns the servers'
// tools into model tools, and runs the agent loop. The model never talks to a server: your code does.
import { dynamicTool, isStepCount, jsonSchema, ToolLoopAgent, type LanguageModel, type ToolSet } from 'ai';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createMCPClient } from '@ai-sdk/mcp';
import { StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { getEncoding } from 'js-tiktoken';

export interface Connection {
  name: string;
  client: Client;
}

/** Start `command args` as a child process and connect to it, preferring the 2026-07-28 protocol. */
export async function connectStdio(name: string, command: string, args: string[]): Promise<Connection> {
  // versionNegotiation defaults to 'legacy' (the 2025 handshake). 'auto' probes with server/discover first.
  const client = new Client({ name: 'acme-host', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(new StdioClientTransport({ command, args, stderr: 'ignore' }));
  return { name, client };
}

const textOf = (r: { content?: unknown }) => ((r.content as { type: string; text?: string }[] | undefined) ?? []).map((c) => c.text ?? '').join('\n');

/**
 * Turn one server's MCP tools into AI SDK tools. Tool names are prefixed with the server name ("acme__rollback")
 * because two servers can (and do) use the same tool name. A tool error is THROWN so the AI SDK hands it to the
 * model as a tool error, exactly as a failing local tool would.
 */
export async function toAiSdkTools(conn: Connection, opts: { prefix?: boolean } = {}): Promise<ToolSet> {
  const { tools } = await conn.client.listTools();
  const set: ToolSet = {};
  for (const t of tools) {
    const key = opts.prefix === false ? t.name : `${conn.name}__${t.name}`;
    set[key] = dynamicTool({
      description: t.description ?? t.title ?? t.name,
      inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (args) => {
        const r = await conn.client.callTool({ name: t.name, arguments: args as Record<string, unknown> });
        if (r.isError) throw new Error(textOf(r));
        return r.structuredContent ?? textOf(r);
      },
    });
  }
  return set;
}

/** Merge tool sets from several servers, refusing silent overwrites: a collision is a bug, not a detail. */
export function mergeToolSets(...sets: ToolSet[]): ToolSet {
  const merged: ToolSet = {};
  for (const set of sets) {
    for (const [name, t] of Object.entries(set)) {
      if (name in merged) throw new Error(`Tool name collision: "${name}" is exposed by more than one server. Prefix tool names with the server name.`);
      merged[name] = t;
    }
  }
  return merged;
}

const enc = getEncoding('o200k_base');
/** What one server costs in EVERY model request: its tool definitions (name, description, JSON Schema) as tokens. */
export async function definitionTokens(conn: Connection): Promise<number> {
  const { tools } = await conn.client.listTools();
  return enc.encode(JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })))).length;
}

export const INSTRUCTIONS = `You are Acme's operations agent. Tools come from several systems; the prefix names the system:
- acme__*: internal operations (deploys, customers, invoices, tickets, handbook). This is where you act.
- status__*: the PUBLIC status page, i.e. what customers see. Read-only.
Look things up before acting, follow the handbook, and finish with a short summary of what you did.`;

export function createMcpAgent(model: LanguageModel, tools: ToolSet, opts: { maxSteps?: number } = {}) {
  return new ToolLoopAgent({ model, instructions: INSTRUCTIONS, tools, stopWhen: isStepCount(opts.maxSteps ?? 10), temperature: 0 });
}

/** Close every client: each one owns a child process, and a forgotten one keeps your CLI from exiting. */
export async function closeAll(conns: Connection[]): Promise<void> {
  await Promise.allSettled(conns.map((c) => c.client.close()));
}

/** The same thing with the AI SDK's own MCP client: what toAiSdkTools does by hand, in one call. */
export async function aiSdkMcpTools(command: string, args: string[]) {
  const mcp = await createMCPClient({ transport: new StdioMCPTransport({ command, args, stderr: 'ignore' }) });
  return { tools: await mcp.tools(), close: () => mcp.close() };
}
