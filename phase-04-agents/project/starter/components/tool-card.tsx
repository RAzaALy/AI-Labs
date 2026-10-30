// One tool call as the user sees it: name, state, input, result, and, for risky calls, the approval card.
type ToolPart = {
  type: string;
  state: string;
  toolCallId: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

/** What the approver sees: the consequence in plain words, never just JSON. */
function describe(name: string, input: Record<string, unknown> = {}) {
  if (name === 'issueRefund') return `Refund USD ${input.amountUSD} on invoice ${input.invoiceId}${input.billingError ? ' (marked as a billing error)' : ''}. Reason: "${input.reason}"`;
  return `${name}(${JSON.stringify(input)})`;
}

export function ToolCard({ part, onDecide: _onDecide }: { part: ToolPart; onDecide: (id: string, approved: boolean) => void }) {
  const name = part.type.slice('tool-'.length);
  return (
    <details className="tool" data-testid={`tool-${name}`} data-state={part.state} open={part.state === 'approval-requested'}>
      <summary>
        🔧 {name}
        <span className={`state ${part.state}`}>{part.state}</span>
      </summary>
      {/* TODO (UI): when part.state === 'approval-requested', render an approval card (className "approve"):
          the consequence in words (describe(name, part.input)) and Approve / Deny buttons calling
          onDecide(part.approval.id, true | false). */}
      <div>input: {JSON.stringify(part.input)}</div>
      {part.state === 'output-available' && <div>output: {JSON.stringify(part.output)}</div>}
      {part.state === 'output-error' && <div>error: {part.errorText}</div>}
      {part.state === 'output-denied' && <div>denied{part.approval?.reason ? `: ${part.approval.reason}` : ''}</div>}
    </details>
  );
}
