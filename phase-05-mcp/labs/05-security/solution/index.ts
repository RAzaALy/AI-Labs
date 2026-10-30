// Lab 05: the host's job when it connects to servers it didn't write. Tool descriptions go straight into the
// model's context, so a server can talk to your model before any tool is ever called. Defenses:
//   1. scan tool definitions for instructions aimed at the model (tool poisoning)
//   2. pin what the user approved, and refuse definitions that change later (rug pulls)
//   3. look at the COMBINATION of servers: private data + untrusted content + a way out = the lethal trifecta
import { createHash } from 'node:crypto';
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';
import type { Tool } from '@modelcontextprotocol/client';
import type { Connection } from '../../02-client-and-agent/solution/index.ts';

export interface Finding {
  tool: string;
  rule: 'invisible-characters' | 'hidden-instructions' | 'secrecy' | 'cross-tool' | 'sensitive-data' | 'too-long';
  severity: 'high' | 'medium';
  evidence: string;
}

const RULES: { rule: Finding['rule']; severity: Finding['severity']; re: RegExp }[] = [
  { rule: 'invisible-characters', severity: 'high', re: /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/ },
  { rule: 'hidden-instructions', severity: 'high', re: /<\/?(important|system|instructions?|admin)>|ignore (all |any )?(previous|prior) instructions|before (using|calling) (this|any) tool/i },
  { rule: 'secrecy', severity: 'high', re: /(do not|don't|never) (mention|tell|reveal|show|inform)|without (telling|informing) the user/i },
  { rule: 'sensitive-data', severity: 'medium', re: /\b(api[_ ]?keys?|passwords?|secrets?|tokens?|ssh|\.env|credentials?|invoices?|private keys?)\b/i },
];

/** Static checks on one tool definition. `otherTools` = names exposed by OTHER servers (a tool has no business mentioning them). */
export function scanToolDefinition(tool: Pick<Tool, 'name' | 'description' | 'inputSchema'>, otherTools: string[] = []): Finding[] {
  const text = `${tool.description ?? ''}\n${JSON.stringify(tool.inputSchema ?? {})}`;
  const findings: Finding[] = [];
  for (const { rule, severity, re } of RULES) {
    const m = text.match(re);
    if (m) findings.push({ tool: tool.name, rule, severity, evidence: JSON.stringify(m[0]) });
  }
  const mentioned = otherTools.filter((n) => n !== tool.name && new RegExp(`\\b${n}\\b`).test(text));
  if (mentioned.length) findings.push({ tool: tool.name, rule: 'cross-tool', severity: 'high', evidence: mentioned.join(', ') });
  if ((tool.description ?? '').length > 1000) findings.push({ tool: tool.name, rule: 'too-long', severity: 'medium', evidence: `${tool.description!.length} chars` });
  return findings;
}

/** A fingerprint of everything the model will see about a tool. Any change = the user hasn't approved this version. */
export function fingerprint(tool: Pick<Tool, 'name' | 'description' | 'inputSchema' | 'annotations'>): string {
  const canonical = JSON.stringify({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema, annotations: tool.annotations ?? {} });
  return createHash('sha256').update(canonical).digest('hex');
}

export type Pins = Record<string, string>;
export const pinTools = (tools: Tool[]): Pins => Object.fromEntries(tools.map((t) => [t.name, fingerprint(t)]));

export function diffPins(pinned: Pins, tools: Tool[]): { changed: string[]; added: string[]; removed: string[] } {
  const now = pinTools(tools);
  return {
    changed: Object.keys(now).filter((n) => n in pinned && pinned[n] !== now[n]),
    added: Object.keys(now).filter((n) => !(n in pinned)),
    removed: Object.keys(pinned).filter((n) => !(n in now)),
  };
}

/**
 * Lab 02's adapter, with a gate in front: only tools that are pinned (approved), unchanged, and free of
 * high-severity findings reach the model. Everything else is reported, not silently dropped.
 */
export async function guardedTools(conn: Connection, pins: Pins | undefined, otherTools: string[] = []) {
  const { tools } = await conn.client.listTools();
  const now = pinTools(tools);
  const blocked: { tool: string; reason: string }[] = [];
  const set: ToolSet = {};
  for (const t of tools) {
    const high = scanToolDefinition(t, otherTools).filter((f) => f.severity === 'high');
    if (high.length) blocked.push({ tool: t.name, reason: `suspicious description: ${high.map((f) => f.rule).join(', ')}` });
    else if (pins && !(t.name in pins)) blocked.push({ tool: t.name, reason: 'new tool, not approved yet' });
    else if (pins && pins[t.name] !== now[t.name]) blocked.push({ tool: t.name, reason: 'definition changed since you approved it' });
    else
      set[`${conn.name}__${t.name}`] = dynamicTool({
        description: t.description ?? t.name,
        inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: async (args) => {
          const r = await conn.client.callTool({ name: t.name, arguments: args as Record<string, unknown> });
          const text = ((r.content as { text?: string }[]) ?? []).map((c) => c.text ?? '').join('\n');
          if (r.isError) throw new Error(text);
          return r.structuredContent ?? text;
        },
      });
  }
  return { tools: set, blocked };
}

/** What the HOST knows about each server: nothing in the protocol tells you this, you decide it per server. */
export interface ServerProfile {
  name: string;
  privateData: boolean; // can read data the user would not publish
  untrustedContent: boolean; // returns text written by people outside your trust boundary (web, email, tickets, notes)
  externalComms: boolean; // can send data somewhere others can read it (HTTP, email, shared boards, issues)
}

export function trifecta(servers: ServerProfile[]) {
  const legs = {
    privateData: servers.filter((s) => s.privateData).map((s) => s.name),
    untrustedContent: servers.filter((s) => s.untrustedContent).map((s) => s.name),
    externalComms: servers.filter((s) => s.externalComms).map((s) => s.name),
  };
  const lethal = legs.privateData.length > 0 && legs.untrustedContent.length > 0 && legs.externalComms.length > 0;
  return {
    legs,
    lethal,
    advice: lethal
      ? 'Remove one leg for this session: drop a server, or require a human to approve every call that sends data out.'
      : 'OK: at most two of the three legs are present.',
  };
}
