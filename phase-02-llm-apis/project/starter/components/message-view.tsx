import type { ChatMessage } from '@/lib/types';


export function MessageView({ message }: { message: ChatMessage }) {
  const m = message.metadata;
  return (
    <div className={`msg ${message.role}`} data-role={message.role}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.text}</span>;
        // TODO D: render tool parts (part.type is `tool-${toolName}`) as a <details className="tool">
        //  with data-testid={`tool-${name}`}, data-state={part.state}, the tool name, its state,
        //  the input, and the output (state 'output-available') or errorText (state 'output-error').
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
