'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, Ticket } from '@/lib/types';
import { CostMeter } from '@/components/cost-meter';
import { MessageView } from '@/components/message-view';

const SESSION_BUDGET_USD = 0.05;
const SUGGESTIONS = ['Where is order ORD-1001?', 'Convert 129.99 USD to PKR', 'How long are logs retained?', 'Where is ORD-9999?'];

export default function Page() {
  const [tier, setTier] = useState<'fast' | 'smart'>('fast');
  const [input, setInput] = useState('');
  const [ticket, setTicket] = useState<{ ticket?: Ticket; costUSD?: number; error?: string } | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const spentRef = useRef(0);

  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // Resolved on every request, so the server always sees the current tier and remaining budget.
      body: () => ({ tier, budgetRemainingUSD: Math.max(0, SESSION_BUDGET_USD - spentRef.current) }),
    }),
  });

  const spent = useMemo(() => messages.reduce((s, m) => s + (m.metadata?.costUSD ?? 0), 0) + (ticket?.costUSD ?? 0), [messages, ticket]);
  useEffect(() => {
    spentRef.current = spent;
  }, [spent]);

  const busy = status === 'submitted' || status === 'streaming';
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect must return void.
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput('');
  };

  async function createTicket() {
    setTicketLoading(true);
    try {
      const res = await fetch('/api/ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) });
      const body = await res.json().catch(() => null);
      setTicket(res.ok && body ? body : { error: body?.error ?? `Ticket failed (HTTP ${res.status}).` });
    } catch {
      setTicket({ error: 'Network error: ticket not created.' });
    } finally {
      setTicketLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel chat">
        <header>
          <h1>Support Copilot</h1>
          <label className="muted">
            model{' '}
            <select value={tier} onChange={(e) => setTier(e.target.value as 'fast' | 'smart')} disabled={busy}>
              <option value="fast">fast (cheap)</option>
              <option value="smart">smart (reasoning)</option>
            </select>
          </label>
        </header>

        <div className="messages" data-testid="messages">
          {messages.length === 0 && (
            <div className="muted">
              Ask about an order, a currency conversion or a company policy. Tools run on the server; the meter on the right shows what every answer costs.
              <div className="suggestions" style={{ marginTop: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          {status === 'submitted' && <div className="muted">thinking…</div>}
          <div ref={bottom} />
        </div>

        {error && (
          <div className="error" role="alert">
            <span>{/budget/i.test(error.message) ? 'Session budget exhausted: start a new chat or raise the budget.' : 'The answer failed.'}</span>
            <span>
              <button onClick={() => { clearError(); regenerate(); }}>Retry</button>
            </span>
          </div>
        )}

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message Support Copilot…" aria-label="Message" />
          {busy ? (
            <button type="button" className="danger" onClick={() => stop()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!input.trim()}>
              Send
            </button>
          )}
        </form>
      </section>

      <aside className="panel">
        <CostMeter messages={messages} budgetUSD={SESSION_BUDGET_USD} spentUSD={spent} />
        <h2 style={{ marginTop: 16 }}>Ticket (structured output)</h2>
        <button onClick={createTicket} disabled={messages.length === 0 || ticketLoading || busy}>
          {ticketLoading ? 'Extracting…' : 'Create ticket from chat'}
        </button>
        {ticket?.error && <p className="muted">{ticket.error}</p>}
        {ticket?.ticket && (
          <dl className="ticket" data-testid="ticket">
            {Object.entries(ticket.ticket).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? v.join(' · ') : String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </aside>
    </main>
  );
}
