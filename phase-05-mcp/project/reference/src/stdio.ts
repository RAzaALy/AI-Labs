// Local transport: a host (Claude Code, the Inspector) starts this process and owns its stdin/stdout.
// Trust model: whoever can start the process already has your shell, so there are no tokens here. The audit log
// still records WHO: the local user, or ACME_ACTOR if you set it.
// stdout is the protocol. Log to stderr only.
import { userInfo } from 'node:os';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { db } from '../../../../phase-04-agents/project/reference/lib/ops.ts';
import { stateKey } from './env.ts';
import { createAcmeMcpServer } from './server.ts';

// No seeding or migrations here: hosts may start this process twice per connection (a version probe, then the
// real one), and two concurrent seeds race. Run `npm run seed` once instead.
const sql = db();
const actor = process.env.ACME_ACTOR ?? `local:${userInfo().username}`;
const key = stateKey();
serveStdio(() => createAcmeMcpServer({ sql, actor, stateKey: key }));
console.error(`[acme-mcp] stdio · acting as ${actor}`);
