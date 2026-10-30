// Usage: npm run seed   (resets the ops tables to the seed world)
import './env';
import { db, seed, snapshot } from '../lib/ops';

const sql = db();
try {
  await seed(sql);
  const s = await snapshot(sql);
  console.log(`Seeded: ${s.deploys.length} deploys · ${s.invoices.length} invoices · 0 refunds · 0 tickets`);
} catch (e) {
  console.error(/ECONNREFUSED/.test(String(e)) ? 'Postgres is not reachable. Start it with: npm run db:up (from the repo root)' : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
