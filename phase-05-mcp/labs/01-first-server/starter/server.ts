// stdio entry point: hosts (Claude Code, the Inspector, your own client) start this file as a child process and
// talk JSON-RPC over its stdin/stdout.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createHandbookServer } from './index.ts';

// TODO 5: serve it. serveStdio(factory) lets the server answer both 2026-07-28 and older 2025 clients.
void serveStdio;
void createHandbookServer;
console.log('[acme-handbook] MCP server ready on stdio'); // keep this line until a check tells you what's wrong with it
