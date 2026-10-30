'use client';

import { useEffect, useState } from 'react';

type World = {
  deploys: { service: string; version: string; status: string; errorRatePct: number }[];
  refunds: { id: number; invoiceId: string; amountUSD: number; reason: string }[];
  tickets: { id: number; subject: string; priority: string }[];
  audit: { id: number; actor: string; action: string; input: unknown; ok: boolean; detail: string }[];
};

/** Ground truth: what the agent actually changed, and the audit log of every tool call. */
export function WorldPanel({ version }: { version: number }) {
  const [world, setWorld] = useState<World | null>(null);
  const [error, setError] = useState('');
  const load = (method: 'GET' | 'POST' = 'GET') =>
    fetch('/api/world', { method })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((w) => (setWorld(w), setError('')))
      .catch((e) => setError(String(e.message ?? e)));
  useEffect(() => {
    load();
  }, [version]);

  if (error) return <p className="muted">World unavailable ({error}). Is Postgres up (npm run db:up)?</p>;
  if (!world) return <p className="muted">Loading…</p>;
  return (
    <div className="world" data-testid="world">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>The world</h2>
        <button onClick={() => load('POST')} title="Reset to the seed data">
          Reset
        </button>
      </div>
      <h3>Deploys</h3>
      <table>
        <tbody>
          {world.deploys.map((d) => (
            <tr key={d.service}>
              <td>{d.service}</td>
              <td>{d.version}</td>
              <td>
                <span className={`pill ${d.status === 'healthy' ? 'good' : 'bad'}`}>{d.status}</span> {d.errorRatePct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Refunds ({world.refunds.length})</h3>
      <table>
        <tbody>
          {world.refunds.map((r) => (
            <tr key={r.id}>
              <td>RF-{r.id}</td>
              <td>{r.invoiceId}</td>
              <td>USD {r.amountUSD}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Tickets ({world.tickets.length})</h3>
      <table>
        <tbody>
          {world.tickets.map((t) => (
            <tr key={t.id}>
              <td>TCK-{1000 + t.id}</td>
              <td>{t.subject}</td>
              <td>{t.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Audit log</h3>
      <div className="audit">
        <table>
          <tbody>
            {world.audit.map((a) => (
              <tr key={a.id}>
                <td>{a.ok ? '✓' : '✗'}</td>
                <td>
                  <b>{a.action}</b> <span className="muted">by {a.actor}</span>
                  <div className="muted">{a.detail.slice(0, 120)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
