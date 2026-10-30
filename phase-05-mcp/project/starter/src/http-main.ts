// npm run http  →  http://localhost:3050/mcp
import { db } from '../../../../phase-04-agents/project/reference/lib/ops.ts';
import { stateKey } from './env.ts';
import { startHttp, tokensFromEnv } from './http.ts';

const s = await startHttp({ sql: db(), tokens: tokensFromEnv(), stateKey: stateKey(), port: Number(process.env.PORT ?? 3050) });
console.error(`[acme-mcp] Streamable HTTP on ${s.url.href} · metadata ${s.metadataUrl}`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void s.close().then(() => process.exit(0)));
