// Acme's public status page as an MCP server. Its getDeployStatus has the SAME NAME as the ops server's, but means
// something else (what customers see). Hosts that merge tools from several servers must namespace.
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const incidents = [
  { id: 'INC-77', title: 'Elevated API error rates', status: 'investigating', since: '2026-10-15T08:12:00Z', components: ['api'] },
  { id: 'INC-74', title: 'Delayed webhook deliveries', status: 'resolved', since: '2026-10-09T13:40:00Z', components: ['worker'] },
];

export function createStatusServer() {
  const server = new McpServer({ name: 'status-page', version: '1.0.0' }, { instructions: 'What customers see on status.acme.example.' });
  server.registerTool(
    'getDeployStatus',
    {
      description: 'Public status of a component as shown on the customer status page (operational / degraded / outage). Not the internal deploy version.',
      inputSchema: z.object({ component: z.enum(['api', 'web', 'worker']) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ component }) => {
      const open = incidents.find((i) => i.status !== 'resolved' && i.components.includes(component));
      const out = { component, publicStatus: open ? 'degraded' : 'operational', incident: open?.id ?? null };
      return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
    },
  );
  server.registerTool(
    'listIncidents',
    { description: 'Incidents on the public status page, newest first.', annotations: { readOnlyHint: true, openWorldHint: false } },
    async () => ({ content: [{ type: 'text', text: JSON.stringify(incidents) }], structuredContent: { incidents } }),
  );
  return server;
}
