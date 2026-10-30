// A small, deterministic "world" for agents to act in: Acme's customers, invoices, deploys and tickets,
// plus a search over the Phase 3 handbook. Business rules live HERE, in code, not in the agent's prompt:
// the agent can ask for anything, and the environment decides what is allowed.
import { loadCorpus } from '../../shared/corpus.ts';

/** The world's clock is fixed so every run (and every eval) sees the same "today". */
export const TODAY = '2026-10-15';

export interface Customer {
  id: string;
  name: string;
  email: string;
  plan: 'Starter' | 'Team' | 'Business';
}
export interface Invoice {
  id: string;
  customerId: string;
  amountUSD: number;
  date: string; // YYYY-MM-DD
  status: 'paid' | 'failed';
  refundedUSD: number;
}
export interface Refund {
  id: string;
  invoiceId: string;
  amountUSD: number;
  reason: string;
  idempotencyKey: string;
}
export interface Deploy {
  service: 'api' | 'web' | 'worker';
  version: string;
  previousVersion: string;
  status: 'healthy' | 'degraded';
  errorRatePct: number;
  deployedAt: string;
}
export interface Ticket {
  id: string;
  subject: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customerId?: string;
}
export interface AuditEntry {
  action: string;
  input: unknown;
  ok: boolean;
  detail: string;
}

/**
 * An error the agent should SEE and recover from: says what went wrong and what to do instead.
 * ("Invoice not found" is useless to a model; "No invoice INV-1. Use listInvoices(customerId) to see valid ids." is not.)
 */
export class ToolError extends Error {}

export interface World {
  customers: Customer[];
  invoices: Invoice[];
  refunds: Refund[];
  deploys: Deploy[];
  tickets: Ticket[];
}

export const seedWorld = (): World => ({
  customers: [
    { id: 'C-101', name: 'Ayesha Khan', email: 'ayesha@khanstudio.pk', plan: 'Team' },
    { id: 'C-102', name: 'Bilal Ahmed', email: 'bilal@ahmedlabs.io', plan: 'Starter' },
    { id: 'C-103', name: 'Northwind Ltd', email: 'billing@northwind.example', plan: 'Business' },
  ],
  invoices: [
    { id: 'INV-20261003', customerId: 'C-101', amountUSD: 99, date: '2026-10-03', status: 'paid', refundedUSD: 0 },
    { id: 'INV-20260903', customerId: 'C-101', amountUSD: 99, date: '2026-09-03', status: 'paid', refundedUSD: 0 },
    { id: 'INV-20261010', customerId: 'C-102', amountUSD: 29, date: '2026-10-10', status: 'paid', refundedUSD: 0 },
    { id: 'INV-20261011', customerId: 'C-102', amountUSD: 29, date: '2026-10-11', status: 'paid', refundedUSD: 0 }, // duplicate charge
    { id: 'INV-20261001', customerId: 'C-103', amountUSD: 399, date: '2026-10-01', status: 'paid', refundedUSD: 0 },
    { id: 'INV-20261012', customerId: 'C-103', amountUSD: 399, date: '2026-10-12', status: 'failed', refundedUSD: 0 },
  ],
  refunds: [],
  deploys: [
    { service: 'api', version: '2026.10.15-2', previousVersion: '2026.10.14-1', status: 'degraded', errorRatePct: 6.4, deployedAt: '2026-10-15T08:40:00Z' },
    { service: 'web', version: '2026.10.13-1', previousVersion: '2026.10.10-3', status: 'healthy', errorRatePct: 0.2, deployedAt: '2026-10-13T10:05:00Z' },
    { service: 'worker', version: '2026.10.12-4', previousVersion: '2026.10.12-2', status: 'healthy', errorRatePct: 0.1, deployedAt: '2026-10-12T11:30:00Z' },
  ],
  tickets: [],
});

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export class AcmeOps {
  readonly world: World;
  readonly audit: AuditEntry[] = [];

  constructor(world: World = seedWorld()) {
    this.world = structuredClone(world);
  }

  private record<T>(action: string, input: unknown, fn: () => T): T {
    try {
      const out = fn();
      this.audit.push({ action, input, ok: true, detail: JSON.stringify(out).slice(0, 200) });
      return out;
    } catch (e) {
      this.audit.push({ action, input, ok: false, detail: (e as Error).message });
      throw e;
    }
  }

  findCustomers(query: string): Customer[] {
    return this.record('findCustomers', { query }, () => {
      const q = query.trim().toLowerCase();
      if (q.length < 2) throw new ToolError('Query too short. Pass at least 2 characters of a name, email or customer id (e.g. "C-101").');
      return this.world.customers.filter((c) => [c.id, c.name, c.email].some((f) => f.toLowerCase().includes(q)));
    });
  }

  listInvoices(customerId: string): (Invoice & { refundableUSD: number; daysAgo: number })[] {
    return this.record('listInvoices', { customerId }, () => {
      if (!this.world.customers.some((c) => c.id === customerId)) throw new ToolError(`No customer ${customerId}. Use findCustomers(query) to look up the id first.`);
      return this.world.invoices
        .filter((i) => i.customerId === customerId)
        .map((i) => ({ ...i, daysAgo: daysBetween(i.date, TODAY), refundableUSD: i.status === 'paid' ? i.amountUSD - i.refundedUSD : 0 }));
    });
  }

  /**
   * Policy (from billing-and-refunds.md): full refund within 30 days of the charge; afterwards only for billing
   * errors (a duplicate charge counts). Never more than what is left on the invoice. Idempotent per key.
   */
  issueRefund(input: { invoiceId: string; amountUSD: number; reason: string; idempotencyKey: string; billingError?: boolean }): Refund & { replayed: boolean } {
    return this.record('issueRefund', input, () => {
      const previous = this.world.refunds.find((r) => r.idempotencyKey === input.idempotencyKey);
      if (previous) return { ...previous, replayed: true }; // a retry of the same request: do nothing twice
      const inv = this.world.invoices.find((i) => i.id === input.invoiceId);
      if (!inv) throw new ToolError(`No invoice ${input.invoiceId}. Use listInvoices(customerId) to see valid invoice ids.`);
      if (inv.status !== 'paid') throw new ToolError(`Invoice ${inv.id} was never paid (status: ${inv.status}), so there is nothing to refund.`);
      if (!(input.amountUSD > 0)) throw new ToolError('amountUSD must be a positive number of US dollars.');
      const left = inv.amountUSD - inv.refundedUSD;
      if (input.amountUSD > left) throw new ToolError(`Only USD ${left} of invoice ${inv.id} is refundable (already refunded: USD ${inv.refundedUSD}).`);
      const age = daysBetween(inv.date, TODAY);
      if (age > 30 && !input.billingError) throw new ToolError(`Invoice ${inv.id} is ${age} days old. Refunds after 30 days are allowed only for billing errors (set billingError: true and explain the error in reason).`);
      inv.refundedUSD += input.amountUSD;
      const refund: Refund = { id: `RF-${this.world.refunds.length + 1}`, invoiceId: inv.id, amountUSD: input.amountUSD, reason: input.reason, idempotencyKey: input.idempotencyKey };
      this.world.refunds.push(refund);
      return { ...refund, replayed: false };
    });
  }

  getDeployStatus(service: string): Deploy {
    return this.record('getDeployStatus', { service }, () => {
      const d = this.world.deploys.find((x) => x.service === service);
      if (!d) throw new ToolError(`Unknown service "${service}". Valid services: api, web, worker.`);
      return { ...d };
    });
  }

  /** Policy (deploys-and-rollbacks.md): roll back to the previous known-good version; no approval needed. */
  rollback(service: string): Deploy {
    return this.record('rollback', { service }, () => {
      const d = this.world.deploys.find((x) => x.service === service);
      if (!d) throw new ToolError(`Unknown service "${service}". Valid services: api, web, worker.`);
      if (d.status === 'healthy') throw new ToolError(`${service} ${d.version} is healthy (error rate ${d.errorRatePct}%). Roll back only a degraded service.`);
      Object.assign(d, { version: d.previousVersion, previousVersion: d.version, status: 'healthy', errorRatePct: 0.3, deployedAt: `${TODAY}T09:00:00Z` });
      return { ...d };
    });
  }

  createTicket(input: Omit<Ticket, 'id'>): Ticket {
    return this.record('createTicket', input, () => {
      if (input.subject.trim().length < 5) throw new ToolError('subject must be a short sentence (at least 5 characters).');
      if (input.customerId && !this.world.customers.some((c) => c.id === input.customerId)) throw new ToolError(`No customer ${input.customerId}. Omit customerId or look it up with findCustomers.`);
      const t = { id: `TCK-${1000 + this.world.tickets.length + 1}`, ...input };
      this.world.tickets.push(t);
      return t;
    });
  }
}

// ---------- handbook search (BM25 over H2 sections of the CURRENT Phase 3 handbook docs) ----------
export interface HandbookHit {
  file: string;
  section: string;
  text: string;
  score: number;
}
type Section = Omit<HandbookHit, 'score'> & { terms: Map<string, number>; len: number };

const STOP = new Set('a an the is are was be to of in on for and or how what when do does i my it at by with can should this that you your'.split(' '));
const tokenize = (s: string) => (s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter((w) => !STOP.has(w));

let sections: Promise<Section[]> | undefined;
async function loadSections(): Promise<Section[]> {
  const docs = (await loadCorpus()).filter((d) => d.meta.status !== 'deprecated');
  const out: Section[] = [];
  for (const d of docs) {
    const parts = d.body.replace(/<!--[\s\S]*?-->/g, '').split(/^## /m);
    for (const [i, part] of parts.entries()) {
      const [head, ...rest] = part.split('\n');
      const section = i === 0 ? '' : head!.trim();
      const text = (i === 0 ? part.replace(/^# .*\n/, '') : rest.join('\n')).trim();
      if (!text) continue;
      const terms = new Map<string, number>();
      const toks = tokenize(`${section} ${text}`);
      for (const t of toks) terms.set(t, (terms.get(t) ?? 0) + 1);
      out.push({ file: d.file, section, text, terms, len: toks.length });
    }
  }
  return out;
}

/** Classic BM25 (k1 = 1.2, b = 0.75). Fine for 50 sections; Phase 3's hybrid search is the real thing. */
export async function searchHandbook(query: string, k = 3): Promise<HandbookHit[]> {
  const secs = await (sections ??= loadSections());
  const avg = secs.reduce((s, x) => s + x.len, 0) / secs.length;
  const q = [...new Set(tokenize(query))];
  const df = new Map(q.map((t) => [t, secs.filter((s) => s.terms.has(t)).length]));
  return secs
    .map((s) => {
      let score = 0;
      for (const t of q) {
        const tf = s.terms.get(t) ?? 0;
        if (!tf) continue;
        const idf = Math.log(1 + (secs.length - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
        score += (idf * tf * 2.2) / (tf + 1.2 * (1 - 0.75 + (0.75 * s.len) / avg));
      }
      return { file: s.file, section: s.section, text: s.text, score: Math.round(score * 100) / 100 };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
