// stdio entry for the Acme ops server: `npx tsx phase-05-mcp/env/servers/acme.ts`.
// One world per connection: a host that connects twice gets two fresh, independent worlds.
// stdout belongs to the protocol. Anything you want to print goes to stderr.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { AcmeOps } from '../../../phase-04-agents/env/acme-ops.ts';
import { createAcmeServer } from '../acme-server.ts';

serveStdio(() => createAcmeServer(new AcmeOps()));
console.error('[acme-ops] MCP server on stdio');
