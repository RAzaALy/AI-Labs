// stdio entry for the status-page server: `npx tsx phase-05-mcp/env/servers/status.ts`.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createStatusServer } from '../status-server.ts';

serveStdio(() => createStatusServer());
console.error('[status-page] MCP server on stdio');
