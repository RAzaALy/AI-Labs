// Lab 01: an MCP server for the Acme handbook, with all three primitives:
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
  try {
    const out = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
  } catch (e) {
    if (e instanceof ToolError) return { isError: true, content: [{ type: 'text', text: e.message }] };
    const ref = Math.random().toString(36).slice(2, 10);
    console.error(`[handbook-mcp] ${tool} failed (ref ${ref}):`, e);
    return { isError: true, content: [{ type: 'text', text: `Internal error in ${tool} (ref ${ref}). Not caused by your input; do not retry.` }] };
  }
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

  server.registerTool(
    'searchHandbook',
    {
      title: 'Search the handbook',
      description: 'Search the current Acme engineering handbook (billing, deploys, incidents, security, ...). Returns up to `limit` sections, best first, each with its source as "file › section".',
      inputSchema: z.object({
        query: z.string().min(2).describe('Keywords or a question, e.g. "refund window days"'),
        limit: z.number().int().min(1).max(5).default(3),
      }),
      outputSchema: z.object({
        hits: z.array(z.object({ source: z.string(), uri: z.string(), excerpt: z.string(), score: z.number() })),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ query, limit }) =>
      safely('searchHandbook', async () => {
        const hits = (await search(query)).slice(0, limit);
        if (hits.length === 0) throw new ToolError(`No handbook section matched "${query}". Try other keywords, or read a document from the handbook:// resources.`);
        return {
          hits: hits.map((h) => ({ source: `${h.file} › ${h.section || '(intro)'}`, uri: `handbook://${slugOf(h.file)}`, excerpt: h.text.length > 600 ? h.text.slice(0, 600) + '…' : h.text, score: h.score })),
        };
      }),
  );

  server.registerResource(
    'handbook-doc',
    new ResourceTemplate('handbook://{slug}', {
      list: async () => ({
        resources: (await currentDocs()).map((d) => ({ uri: `handbook://${slugOf(d.file)}`, name: slugOf(d.file), title: d.title, mimeType: 'text/markdown', description: `Owner: ${d.meta.owner ?? 'unknown'} · updated ${d.meta.updated ?? '?'}` })),
      }),
      complete: { slug: async (value) => (await currentDocs()).map((d) => slugOf(d.file)).filter((s) => s.startsWith(value)) },
    }),
    { title: 'Handbook document', mimeType: 'text/markdown', description: 'One current handbook document as markdown.' },
    async (uri, { slug }) => {
      const doc = (await currentDocs()).find((d) => slugOf(d.file) === slug);
      if (!doc) throw new ResourceNotFoundError(uri.href);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: doc.body }] };
    },
  );

  server.registerPrompt(
    'answerWithCitations',
    {
      title: 'Answer from the handbook',
      description: 'Answer a question using only the handbook, with the most relevant sections attached.',
      argsSchema: z.object({ question: z.string().describe('What do you want to know?') }),
    },
    async ({ question }) => {
      const hits = (await search(question)).slice(0, 2);
      return {
        description: `Handbook answer for: ${question}`,
        messages: [
          ...hits.map((h) => ({
            role: 'user' as const,
            content: { type: 'resource' as const, resource: { uri: `handbook://${slugOf(h.file)}`, mimeType: 'text/markdown', text: `## ${h.section}\n${h.text}` } },
          })),
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: `Answer using ONLY the handbook sections above. Cite each fact as "file › section". If they don't answer it, say so.\n\nQuestion: ${question}` },
          },
        ],
      };
    },
  );
  return server;
}
