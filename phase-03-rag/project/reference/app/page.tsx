'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import type { Source } from '@/lib/answer';
import { AnswerText } from '@/components/answer-text';
import { SourcesPanel } from '@/components/sources-panel';

const SUGGESTIONS = ['How do I undo a bad release?', 'What does error E-4290 mean?', 'How long do customers have to ask for a refund?', 'What is the office wifi password?'];

const sourcesOf = (m: ChatMessage): Source[] => m.parts.flatMap((p) => (p.type === 'data-sources' ? p.data : []));
const textOf = (m: ChatMessage) => m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('');

export default function Page() {
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null); // which assistant message the panel shows
  const [focus, setFocus] = useState<number | null>(null);
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<ChatMessage>({ transport: new DefaultChatTransport({ api: '/api/chat' }) });

  const busy = status === 'submitted' || status === 'streaming';
  const assistants = messages.filter((m) => m.role === 'assistant');
  const current = assistants.find((m) => m.id === selected) ?? assistants.at(-1);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setSelected(null);
    setFocus(null);
    sendMessage({ text });
    setInput('');
  };
  const cite = (m: ChatMessage, n: number) => {
    setSelected(m.id);
    setFocus(n);
    requestAnimationFrame(() => {
      document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  return (
    <main className="shell">
      <section className="panel chat">
        <header>
          <h1>Docs Chat · Acme handbook</h1>
          <span className="muted">answers only from the docs, with citations</span>
        </header>

        <div className="messages" data-testid="messages">
          {messages.length === 0 && (
            <div className="muted">
              Ask anything about the Acme Cloud engineering handbook. Click a citation chip to see the passage it came from.
              <div className="suggestions" style={{ marginTop: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            if (m.role === 'user') return <div key={m.id} className="msg user">{textOf(m)}</div>;
            const sources = sourcesOf(m);
            const meta = m.metadata;
            return (
              <div key={m.id} className={`msg assistant ${current?.id === m.id ? 'selected' : ''}`} data-role="assistant" onClick={() => setSelected(m.id)}>
                <AnswerText text={textOf(m)} valid={new Set(sources.map((s) => s.n))} onCite={(n) => cite(m, n)} />
                {meta?.finishedAt && (
                  <div className="meta" data-testid="meta">
                    {meta.answerable === false && <span className="badge idk">not in the docs</span>}
                    {meta.problems?.map((p) => (
                      <span key={p} className="badge bad">
                        ⚠ {p}
                      </span>
                    ))}
                    {meta.modelId} · {meta.embedder} · retrieval {meta.retrievalMs} ms · total {((meta.finishedAt - (meta.startedAt ?? meta.finishedAt)) / 1000).toFixed(1)} s
                  </div>
                )}
              </div>
            );
          })}
          {status === 'submitted' && <div className="muted">searching the docs…</div>}
          <div ref={bottom} />
        </div>

        {error && (
          <div className="error" role="alert">
            <span>{error.message || 'The answer failed.'}</span>
            <button onClick={() => { clearError(); regenerate(); }}>Retry</button>
          </div>
        )}

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the handbook…" aria-label="Question" />
          {busy ? (
            <button type="button" className="danger" onClick={() => stop()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!input.trim()}>
              Ask
            </button>
          )}
        </form>
      </section>

      <aside className="panel">
        <h2>Sources {current ? `(${sourcesOf(current).length})` : ''}</h2>
        <SourcesPanel sources={current ? sourcesOf(current) : []} cited={current?.metadata?.citations ?? []} focus={focus} />
      </aside>
    </main>
  );
}
