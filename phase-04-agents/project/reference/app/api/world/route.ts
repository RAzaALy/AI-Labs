// The world panel: what actually changed (deploys, refunds, tickets) and the audit log of who did what.
import { db, ensureReady, seed, snapshot } from '@/lib/ops';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureReady(db());
  return Response.json(await snapshot(db()));
}

/** Reset the demo world to its seed state. A development convenience: never ship this endpoint. */
export async function POST() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_WORLD_RESET !== '1') return Response.json({ error: 'disabled' }, { status: 403 });
  await seed(db());
  return Response.json(await snapshot(db()));
}
