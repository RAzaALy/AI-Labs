// stdio entry point: hosts (Claude Code, the Inspector, your own client) start this file as a child process and
// talk JSON-RPC over its stdin/stdout. So stdout is THE PROTOCOL: write logs to stderr (console.error), never stdout.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createHandbookServer } from './index.ts';

serveStdio(() => createHandbookServer());
console.error('[acme-handbook] MCP server ready on stdio');
