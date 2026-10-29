import type { Source } from '@/lib/answer';

export function SourcesPanel({ sources, cited, focus }: { sources: Source[]; cited: number[]; focus: number | null }) {
  if (sources.length === 0) return <p className="muted">Ask a question: the passages retrieved for it appear here, and the ones the answer cites are highlighted.</p>;
  return (
    <div className="sources" data-testid="sources">
      {sources.map((s) => (
        <article key={s.id} id={`source-${s.n}`} className={`source ${cited.includes(s.n) ? 'cited' : 'uncited'} ${focus === s.n ? 'focus' : ''}`}>
          <header>
            <span className="n">[{s.n}]</span>
            <span className="where">
              {s.file}
              {s.section ? ` › ${s.section}` : ''}
            </span>
          </header>
          <pre>{s.content}</pre>
        </article>
      ))}
    </div>
  );
}
