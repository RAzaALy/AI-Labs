// npm run seed: create the ops tables and reset them to the demo world (same as Phase 4's).
import { db, seed, snapshot } from '../../../../phase-04-agents/project/reference/lib/ops.ts';
import './env.ts';

const sql = db();
await seed(sql);
const s = await snapshot(sql);
console.log(`Seeded: ${s.deploys.length} deploys · ${s.invoices.length} invoices · ${s.refunds.length} refunds · ${s.tickets.length} tickets`);
await sql.end({ timeout: 5 });
