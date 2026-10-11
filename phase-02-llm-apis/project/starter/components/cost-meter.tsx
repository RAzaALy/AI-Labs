import type { ChatMessage } from '@/lib/types';

export function CostMeter({ messages, budgetUSD, spentUSD }: { messages: ChatMessage[]; budgetUSD: number; spentUSD: number }) {
  // TODO E: answered = assistant messages that have metadata.costUSD; sum(k) adds metadata[k] across them.
  const answered: ChatMessage[] = [];
  const sum = (k: 'inputTokens' | 'outputTokens' | 'reasoningTokens' | 'cachedInputTokens') => (void [k, messages], 0);
  const left = Math.max(0, budgetUSD - spentUSD);
  const pctLeft = (left / budgetUSD) * 100;
  return (
    <div data-testid="meter">
      <h2>Token &amp; cost meter</h2>
      <div className="stat-grid">
        <div className="stat"><b>{sum('inputTokens').toLocaleString()}</b><span>input tokens</span></div>
        <div className="stat"><b>{sum('outputTokens').toLocaleString()}</b><span>output tokens</span></div>
        <div className="stat"><b>{sum('reasoningTokens').toLocaleString()}</b><span>of which reasoning</span></div>
        <div className="stat"><b>{sum('cachedInputTokens').toLocaleString()}</b><span>cached input</span></div>
        <div className="stat"><b data-testid="spent">${spentUSD.toFixed(5)}</b><span>session spend</span></div>
        <div className="stat"><b>{answered.length}</b><span>answers</span></div>
      </div>
      <div className="budget" title={`$${left.toFixed(5)} of $${budgetUSD} left`}>
        <div className={pctLeft < 20 ? 'low' : ''} style={{ width: `${pctLeft}%` }} />
      </div>
      <div className="muted">${left.toFixed(5)} of ${budgetUSD.toFixed(2)} session budget left</div>
      <div className="log">
        {answered.map((m, i) => (
          <div key={m.id}>
            <span>#{i + 1} {m.metadata?.modelId}</span>
            <span>${m.metadata?.costUSD?.toFixed(5)}</span>
          </div>
        ))}
      </div>
      <p className="muted">Note: the input tokens grow every turn, because the whole history is resent (Phase 1).</p>
    </div>
  );
}
