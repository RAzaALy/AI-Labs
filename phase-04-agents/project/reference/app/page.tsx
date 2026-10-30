'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { useEffect, useRef, useState } from 'react';
import type { OpsMessage } from '@/lib/types';
import { ToolCard } from '@/components/tool-card';
import { WorldPanel } from '@/components/world-panel';

const SUGGESTIONS = [
  'Customers see API errors since this morning. Investigate and fix it.',
  'Ayesha Khan says her early-October charge was a mistake. Refund it.',
  'Bilal Ahmed was charged twice in October. Fix it.',
  'What is our refund policy?',
];

export default function Page() {
  const [input, setInput] = useState('');
  const [worldVersion, setWorldVersion] = useState(0);
  const { messages, sendMessage, status, stop, error, regenerate, clearError, addToolApprovalResponse } = useChat<OpsMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    // After the user approves or denies, resume the agent automatically.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => setWorldVersion((v) => v + 1),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput('');
  };

  return (
    <main className="shell">
      <section className="panel chat">
        <header>
          <h1>Ops Copilot</h1>
          <span className="muted">an agent with tools · refunds need your approval</span>
        </header>
        <div className="messages" data-testid="messages">
          {messages.length === 0 && (
            <div className="muted">
              Ask the copilot to investigate an incident, look up a customer, refund a charge or check a policy. Watch the world panel: it shows what really changed.
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
            <div key={m.id} className={`msg ${m.role}`} data-role={m.role}>
              {m.parts.map((part, i) => {
                if (part.type === 'text') return <span key={i}>{part.text}</span>;
                if (part.type.startsWith('tool-'))
                  return <ToolCard key={i} part={part as never} onDecide={(id, approved) => addToolApprovalResponse({ id, approved, reason: approved ? 'approved in chat' : 'denied in chat' })} />;
                return null;
              })}
              {m.role === 'assistant' && m.metadata?.finishedAt && (
                <div className="meta" data-testid="meta">
                  {m.metadata.modelId} · {m.metadata.steps} step(s) · {m.metadata.inputTokens} in / {m.metadata.outputTokens} out · {((m.metadata.finishedAt - (m.metadata.startedAt ?? m.metadata.finishedAt)) / 1000).toFixed(1)} s ·{' '}
                  {m.metadata.stoppedBy === 'awaiting-approval' ? '⏸ waiting for your approval' : m.metadata.stoppedBy === 'max-steps' ? '⚠ stopped at the step cap' : m.metadata.stoppedBy === 'budget' ? '⚠ stopped at the token budget' : 'done'}
                </div>
              )}
            </div>
          ))}
          {status === 'submitted' && <div className="muted">thinking…</div>}
          <div ref={bottom} />
        </div>
        {error && (
          <div className="error" role="alert">
            <span>{error.message || 'The agent failed.'}</span>
            <button onClick={() => { clearError(); regenerate(); }}>Retry</button>
          </div>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the ops copilot…" aria-label="Message" />
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
      <aside className="panel" style={{ overflowY: 'auto' }}>
        <WorldPanel version={worldVersion} />
      </aside>
    </main>
  );
}
