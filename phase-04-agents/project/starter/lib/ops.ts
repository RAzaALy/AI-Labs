// The Acme operations world in Postgres. Every business rule is enforced HERE, inside transactions:
// the agent can ask for anything, and this module decides what is allowed and records who did what.
import postgres from 'postgres';

export type Sql = postgres.Sql;

const g = globalThis as unknown as { __opsSql?: Sql };
export function db(): Sql {
  g.__opsSql ??= postgres(process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5433/rag', { max: 10, onnotice: () => {} });
  return g.__opsSql;
}

/** The world's clock is fixed so every run and every eval sees the same "today". */
export const TODAY = '2026-10-15';

/** An error the agent should see and recover from: what went wrong, and what to do instead. */
export class ToolError extends Error {}

export async function ensureSchema(sql: Sql) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ops_customers (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, plan text NOT NULL);
    CREATE TABLE IF NOT EXISTS ops_invoices (
      id text PRIMARY KEY, customer_id text NOT NULL REFERENCES ops_customers(id), amount_usd numeric(10,2) NOT NULL,
      date date NOT NULL, status text NOT NULL, refunded_usd numeric(10,2) NOT NULL DEFAULT 0,
      CHECK (refunded_usd <= amount_usd));
    CREATE TABLE IF NOT EXISTS ops_refunds (
      id serial PRIMARY KEY, invoice_id text NOT NULL REFERENCES ops_invoices(id), amount_usd numeric(10,2) NOT NULL,
      reason text NOT NULL, idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS ops_deploys (
      service text PRIMARY KEY, version text NOT NULL, previous_version text NOT NULL, status text NOT NULL, error_rate_pct numeric(5,2) NOT NULL);
    CREATE TABLE IF NOT EXISTS ops_tickets (
      id serial PRIMARY KEY, subject text NOT NULL, body text NOT NULL, priority text NOT NULL, customer_id text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS ops_audit (
      id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, action text NOT NULL,
      input jsonb NOT NULL, ok boolean NOT NULL, detail text NOT NULL);
  `);
}

/** Reset to the seed data (the same world as the labs). Safe to run any time in development. */
export async function seed(sql: Sql) {
  await ensureSchema(sql);
  await sql.begin(async (tx) => {
    await tx`TRUNCATE ops_audit, ops_tickets, ops_refunds, ops_invoices, ops_deploys, ops_customers RESTART IDENTITY CASCADE`;
    await tx`INSERT INTO ops_customers ${tx([
      { id: 'C-101', name: 'Ayesha Khan', email: 'ayesha@khanstudio.pk', plan: 'Team' },
      { id: 'C-102', name: 'Bilal Ahmed', email: 'bilal@ahmedlabs.io', plan: 'Starter' },
      { id: 'C-103', name: 'Northwind Ltd', email: 'billing@northwind.example', plan: 'Business' },
    ])}`;
    await tx`INSERT INTO ops_invoices ${tx([
      { id: 'INV-20261003', customer_id: 'C-101', amount_usd: 99, date: '2026-10-03', status: 'paid' },
      { id: 'INV-20260903', customer_id: 'C-101', amount_usd: 99, date: '2026-09-03', status: 'paid' },
      { id: 'INV-20261010', customer_id: 'C-102', amount_usd: 29, date: '2026-10-10', status: 'paid' },
      { id: 'INV-20261011', customer_id: 'C-102', amount_usd: 29, date: '2026-10-11', status: 'paid' },
      { id: 'INV-20261001', customer_id: 'C-103', amount_usd: 399, date: '2026-10-01', status: 'paid' },
      { id: 'INV-20261012', customer_id: 'C-103', amount_usd: 399, date: '2026-10-12', status: 'failed' },
    ])}`;
    await tx`INSERT INTO ops_deploys ${tx([
      { service: 'api', version: '2026.10.15-2', previous_version: '2026.10.14-1', status: 'degraded', error_rate_pct: 6.4 },
      { service: 'web', version: '2026.10.13-1', previous_version: '2026.10.10-3', status: 'healthy', error_rate_pct: 0.2 },
      { service: 'worker', version: '2026.10.12-4', previous_version: '2026.10.12-2', status: 'healthy', error_rate_pct: 0.1 },
    ])}`;
  });
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const iso = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));

export class OpsStore {
  /** `actor` is who the agent acts for: every audit row says which user's request caused it. */
  constructor(
    private sql: Sql,
    private actor = 'agent',
  ) {}

  private async audited<T>(action: string, input: unknown, fn: () => Promise<T>): Promise<T> {
    try {
      const out = await fn();
      await this.sql`INSERT INTO ops_audit (actor, action, input, ok, detail) VALUES (${this.actor}, ${action}, ${this.sql.json(input as never)}, true, ${JSON.stringify(out).slice(0, 300)})`;
      return out;
    } catch (e) {
      await this.sql`INSERT INTO ops_audit (actor, action, input, ok, detail) VALUES (${this.actor}, ${action}, ${this.sql.json(input as never)}, false, ${(e as Error).message.slice(0, 300)})`;
      throw e;
    }
  }

  findCustomers(query: string) {
    return this.audited('findCustomers', { query }, async () => {
      if (query.trim().length < 2) throw new ToolError('Query too short. Pass at least 2 characters of a name, email or customer id (e.g. "C-101").');
      const q = `%${query.trim()}%`;
      return this.sql<{ id: string; name: string; email: string; plan: string }[]>`
        SELECT id, name, email, plan FROM ops_customers WHERE id ILIKE ${q} OR name ILIKE ${q} OR email ILIKE ${q} ORDER BY id`;
    });
  }

  listInvoices(customerId: string) {
    return this.audited('listInvoices', { customerId }, async () => {
      const [c] = await this.sql`SELECT 1 FROM ops_customers WHERE id = ${customerId}`;
      if (!c) throw new ToolError(`No customer ${customerId}. Use findCustomers(query) to look up the id first.`);
      const rows = await this.sql<{ id: string; amount_usd: string; date: Date; status: string; refunded_usd: string }[]>`
        SELECT id, amount_usd, date, status, refunded_usd FROM ops_invoices WHERE customer_id = ${customerId} ORDER BY date DESC`;
      return rows.map((r) => {
        const daysAgo = daysBetween(iso(r.date), TODAY);
        return { id: r.id, amountUSD: Number(r.amount_usd), date: iso(r.date), daysAgo, status: r.status, refundableUSD: r.status === 'paid' ? Number(r.amount_usd) - Number(r.refunded_usd) : 0, withinRefundWindow: daysAgo <= 30 };
      });
    });
  }

  /**
   * Policy (billing-and-refunds.md): within 30 days of the charge, later only for billing errors; never more than is
   * left on the invoice. The row lock (FOR UPDATE) makes two concurrent refunds of one invoice safe, and the UNIQUE
   * idempotency key makes a replayed request return the first result instead of refunding twice.
   */
  issueRefund(input: { invoiceId: string; amountUSD: number; reason: string; billingError?: boolean; idempotencyKey: string }) {
    return this.audited('issueRefund', input, async (): Promise<{ refundId: string; invoiceId: string; amountUSD: number; replayed: boolean }> => {
      // TODO (AC4, AC5, AC8): in ONE transaction (this.sql.begin(async (tx) => ...)):
      //  1. idempotency: a refund with this idempotency_key exists → return it with replayed: true (no second refund)
      //  2. SELECT the invoice FOR UPDATE (two concurrent refunds must not both pass the checks)
      //  3. ToolErrors (say what to do next!): unknown invoice · status !== 'paid' · amountUSD <= 0
      //     · amountUSD > amount_usd - refunded_usd · older than 30 days (daysBetween(iso(date), TODAY)) without billingError
      //  4. UPDATE ops_invoices refunded_usd += amount; INSERT INTO ops_refunds (..., idempotency_key) RETURNING id
      //  5. return { refundId: `RF-${id}`, invoiceId, amountUSD, replayed: false }
      void [daysBetween, iso, TODAY];
      throw new Error('TODO: issueRefund');
    });
  }

  getDeployStatus(service: string) {
    return this.audited('getDeployStatus', { service }, async () => {
      const [d] = await this.sql`SELECT service, version, previous_version, status, error_rate_pct FROM ops_deploys WHERE service = ${service}`;
      if (!d) throw new ToolError(`Unknown service "${service}". Valid services: api, web, worker.`);
      return { service: d.service as string, version: d.version as string, previousVersion: d.previous_version as string, status: d.status as string, errorRatePct: Number(d.error_rate_pct) };
    });
  }

  /** Policy (deploys-and-rollbacks.md): roll back to the previous known-good version; no approval needed. */
  rollback(service: string) {
    return this.audited('rollback', { service }, async (): Promise<{ service: string; version: string; status: string }> => {
      // TODO (AC2): in a transaction, SELECT the deploy FOR UPDATE. Unknown service → ToolError listing valid services.
      // Healthy → ToolError ("Roll back only a degraded service"). Otherwise swap version/previous_version,
      // set status 'healthy', error_rate_pct 0.3, and return { service, version: <the previous version>, status: 'healthy' }.
      throw new Error('TODO: rollback');
    });
  }

  createTicket(input: { subject: string; body: string; priority: string; customerId?: string }) {
    return this.audited('createTicket', input, async () => {
      if (input.subject.trim().length < 5) throw new ToolError('subject must be a short sentence (at least 5 characters).');
      const [t] = await this.sql`INSERT INTO ops_tickets (subject, body, priority, customer_id) VALUES (${input.subject}, ${input.body}, ${input.priority}, ${input.customerId ?? null}) RETURNING id`;
      return { ticketId: `TCK-${1000 + t!.id}` };
    });
  }
}

/** Everything the UI's world panel (and the eval graders) look at. */
export async function snapshot(sql: Sql) {
  const [deploys, invoices, refunds, tickets, audit] = await Promise.all([
    sql`SELECT service, version, status, error_rate_pct::float AS "errorRatePct" FROM ops_deploys ORDER BY service`,
    sql`SELECT id, customer_id AS "customerId", amount_usd::float AS "amountUSD", refunded_usd::float AS "refundedUSD", status FROM ops_invoices ORDER BY id`,
    sql`SELECT id, invoice_id AS "invoiceId", amount_usd::float AS "amountUSD", reason FROM ops_refunds ORDER BY id`,
    sql`SELECT id, subject, priority FROM ops_tickets ORDER BY id`,
    sql`SELECT id, at, actor, action, input, ok, detail FROM ops_audit ORDER BY id DESC LIMIT 25`,
  ]);
  return { deploys, invoices, refunds, tickets, audit };
}

/** Create the tables and seed them once, on first use (`npm run seed` resets them explicitly). */
export async function ensureReady(sql: Sql) {
  const [t] = await sql`SELECT to_regclass('ops_deploys') AS t`;
  if (!t?.t) return seed(sql);
  const [n] = await sql`SELECT count(*)::int AS n FROM ops_deploys`;
  if (!n?.n) await seed(sql);
}
