// Renders an answer with its inline [n] citations turned into clickable chips.
// Citations that point at no source are shown in red: the UI never hides a grounding problem.
export function AnswerText({ text, valid, onCite }: { text: string; valid: Set<number>; onCite: (n: number) => void }) {
  const pieces = text.split(/(\[\d+\])/g);
  return (
    <span>
      {pieces.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const n = Number(m[1]);
        return valid.has(n) ? (
          <button key={i} type="button" className="cite" data-testid="cite" onClick={() => onCite(n)} aria-label={`Show source ${n}`}>
            {n}
          </button>
        ) : (
          <span key={i} className="cite bad" title="This citation does not match any retrieved source">
            {n}?
          </span>
        );
      })}
    </span>
  );
}
