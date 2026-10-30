// Lab 05 (starter): the host's job when it connects to servers it didn't write. Tool descriptions go straight into the
// model's context, so a server can talk to your model before any tool is ever called. Defenses:
//   1. scan tool definitions for instructions aimed at the model (tool poisoning)
//   2. pin what the user approved, and refuse definitions that change later (rug pulls)
//   3. look at the COMBINATION of servers: private data + untrusted content + a way out = the lethal trifecta
import { createHash } from 'node:crypto';
import { dynamicTool, jsonSchema } from 'ai';
import type { Tool } from '@modelcontextprotocol/client';
import type { Connection } from '../../02-client-and-agent/solution/index.ts';

export interface Finding {
  tool: string;
  rule: 'invisible-characters' | 'hidden-instructions' | 'secrecy' | 'cross-tool' | 'sensitive-data' | 'too-long';
  severity: 'high' | 'medium';
  evidence: string;
}

// TODO 1: regexes for: invisible characters (zero-width U+200B–U+200F, bidi U+202A–U+202E, U+2060–U+2064, U+FEFF),
// hidden instructions (<IMPORTANT>, <system>, "ignore previous instructions", "before using this tool"),
// secrecy ("do not mention/tell", "without telling the user") and sensitive data (api keys, passwords, .env, invoices...).
// Run them against honest tools too: a scanner that flags everything gets switched off.
const RULES: { rule: Finding['rule']; severity: Finding['severity']; re: RegExp }[] = [];

/** Static checks on one tool definition. `otherTools` = names exposed by OTHER servers (a tool has no business mentioning them). */
export function scanToolDefinition(tool: Pick<Tool, 'name' | 'description' | 'inputSchema'>, otherTools: string[] = []): Finding[] {
  // TODO 2: test description + JSON.stringify(inputSchema) against RULES; add 'cross-tool' (high) when the text
  //   names a tool from otherTools, and 'too-long' (medium) above 1000 characters.
  void RULES;
  throw new Error('TODO: scanToolDefinition');
}

/** A fingerprint of everything the model will see about a tool. Any change = the user hasn't approved this version. */
export function fingerprint(tool: Pick<Tool, 'name' | 'description' | 'inputSchema' | 'annotations'>): string {
  // TODO 3: sha256 of a canonical JSON of { name, description, inputSchema, annotations }
  void createHash;
  throw new Error('TODO: fingerprint');
}

export type Pins = Record<string, string>;
export const pinTools = (tools: Tool[]): Pins => Object.fromEntries(tools.map((t) => [t.name, fingerprint(t)]));

export function diffPins(pinned: Pins, tools: Tool[]): { changed: string[]; added: string[]; removed: string[] } {
  // TODO 4: compare pinned fingerprints with pinTools(tools): changed / added / removed tool names
  throw new Error('TODO: diffPins');
}

/**
 * Lab 02's adapter, with a gate in front: only tools that are pinned (approved), unchanged, and free of
 * high-severity findings reach the model. Everything else is reported, not silently dropped.
 */
export async function guardedTools(conn: Connection, pins: Pins | undefined, otherTools: string[] = []) {
  // TODO 5: like Lab 02's toAiSdkTools, but block (and report) a tool when:
  //   - scanToolDefinition finds a high-severity issue
  //   - pins are given and the tool is not in them (never approved), or its fingerprint changed
  void dynamicTool;
  void jsonSchema;
  throw new Error('TODO: guardedTools');
}

/** What the HOST knows about each server: nothing in the protocol tells you this, you decide it per server. */
export interface ServerProfile {
  name: string;
  privateData: boolean; // can read data the user would not publish
  untrustedContent: boolean; // returns text written by people outside your trust boundary (web, email, tickets, notes)
  externalComms: boolean; // can send data somewhere others can read it (HTTP, email, shared boards, issues)
}

export function trifecta(servers: ServerProfile[]) {
  // TODO 6: which servers provide each leg; lethal when all three legs are present; advice says how to break it
  throw new Error('TODO: trifecta');
}
