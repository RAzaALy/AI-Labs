import type { ChatMessage } from '@/lib/types';

type AnyToolPart = { type: string; state: string; toolCallId: string; input?: unknown; output?: unknown; errorText?: string };

export function MessageView({ message }: { message: ChatMessage }) {
  const m = message.metadata;
  return (
    <div className={`msg ${message.role}`} data-role={message.role}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.text}</span>;
        if (part.type.startsWith('tool-')) {
          const t = part as unknown as AnyToolPart;
          const name = t.type.slice('tool-'.length);
          return (
            <details key={i} className="tool" data-testid={`tool-${name}`} data-state={t.state}>
              <summary>
                🔧 {name}
                <span className={`state ${t.state === 'output-error' ? 'error' : ''}`}>{t.state}</span>
              </summary>
              <div>input: {JSON.stringify(t.input)}</div>
              {t.state === 'output-available' && <div>output: {JSON.stringify(t.output)}</div>}
              {t.state === 'output-error' && <div>error: {t.errorText}</div>}
            </details>
          );
        }
        return null;
      })}
      {message.role === 'assistant' && m?.costUSD !== undefined && (
        <div className="meta" data-testid="meta">
          {m.modelId} · {m.inputTokens} in / {m.outputTokens} out
          {m.reasoningTokens ? ` (${m.reasoningTokens} reasoning)` : ''}
          {m.cachedInputTokens ? ` · ${m.cachedInputTokens} cached` : ''} · ${m.costUSD.toFixed(5)}
          {m.finishedAt && m.startedAt ? ` · ${((m.finishedAt - m.startedAt) / 1000).toFixed(1)}s` : ''}
        </div>
      )}
    </div>
  );
}
