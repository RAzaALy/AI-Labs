// Lab 01 (starter): an MCP server for the Acme handbook, with all three primitives:
//   tool     searchHandbook       the MODEL decides to call it
//   resource handbook://{slug}    the APPLICATION (or user) decides to attach it as context
//   prompt   answerWithCitations  the USER picks it (a slash command in most hosts)
import { McpServer, ResourceNotFoundError, ResourceTemplate } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ToolError, searchHandbook, type HandbookHit } from '../../../../phase-04-agents/env/acme-ops.ts';
import { loadCorpus } from '../../../../shared/corpus.ts';

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/**
 * Turn a tool body's outcome into an MCP tool result.
 * - success → JSON text (for older clients) + the same object as `structuredContent` (validated against outputSchema)
 * - ToolError → `isError: true` with the message: the model reads it and recovers
 * - anything else → `isError: true` with a generic message and a reference id; the details go to STDERR only
 *   (the SDK would otherwise send the raw error message to the client: stack hints, hostnames, secrets...)
 */
export async function safely(tool: string, fn: () => Promise<Record<string, unknown>> | Record<string, unknown>): Promise<ToolResult> {
  // TODO 1: run fn() and turn the outcome into an MCP tool result:
  //   success    → { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out }
  //   ToolError  → { isError: true, content: [text: e.message] }  (the model reads it and recovers)
  //   any other  → { isError: true, content: [a GENERIC message with a reference id] }, and console.error the details.
  //                Never put e.message in the result: it can carry hostnames, SQL, credentials.
  throw new Error('TODO: safely');
}

const slugOf = (file: string) => file.replace(/\.md$/, '');

/** Only CURRENT documents are served: Phase 3 taught us what happens when the deprecated refund policy leaks in. */
async function currentDocs() {
  return (await loadCorpus()).filter((d) => d.meta.status !== 'deprecated').sort((a, b) => a.file.localeCompare(b.file));
}

export function createHandbookServer(opts: { search?: (q: string) => Promise<HandbookHit[]> } = {}): McpServer {
  const search = opts.search ?? ((q: string) => searchHandbook(q));
  const server = new McpServer(
    { name: 'acme-handbook', version: '1.0.0' },
    { instructions: 'The Acme engineering handbook. Use searchHandbook for questions; cite sources as "file › section".' },
  );

  // TODO 2: server.registerTool('searchHandbook', { description, inputSchema, outputSchema, annotations }, handler)
  //   - inputSchema: z.object({ query: string, min 2 chars; limit: int 1..5, default 3 })
  //   - outputSchema: z.object({ hits: [{ source: "file › section", uri: "handbook://<slug>", excerpt, score }] })
  //   - annotations: it only reads (readOnlyHint, idempotentHint), and only Acme data (openWorldHint: false)
  //   - handler: wrap in safely(); no hits → throw a ToolError that says what to try next
  //   Use `search(query)` (not searchHandbook directly) so the check can inject a failing search.

  // TODO 3: server.registerResource('handbook-doc', new ResourceTemplate('handbook://{slug}', { list, complete }), metadata, read)
  //   - list: every CURRENT doc (currentDocs()) as { uri, name, title, mimeType: 'text/markdown', description }
  //   - complete: { slug: value => slugs starting with value }
  //   - read: the doc's markdown; unknown slug → throw new ResourceNotFoundError(uri.href)

  // TODO 4: server.registerPrompt('answerWithCitations', { title, description, argsSchema: z.object({ question }) }, handler)
  //   - messages: the top 2 search hits as embedded resources ({ type: 'resource', resource: { uri, mimeType, text } }),
  //     then a text message: "Answer using ONLY the handbook sections above. Cite each fact as "file › section". ..."
  void search;
  void slugOf;
  void ResourceTemplate;
  void ResourceNotFoundError;
  void z;
  return server;
}
