# 6. Safety and human-in-the-loop

**Time:** 25 min · **Visualization:** [`approval-flow.html`](../visualizations/approval-flow.html) · **Lab:** [`labs/05-human-in-the-loop`](../labs/05-human-in-the-loop)

## The idea
An agent acts with **your** credentials, on input written by **someone else**. Design for the model being wrong *and* for the model being manipulated:

1. **Least privilege.** Only the tools a task needs. Read-only by default, and scoped credentials per user and tenant.
2. **Policy in code.** Refund windows, amount limits and "healthy services can't be rolled back" are enforced in the tool, not the prompt.
3. **Human approval for consequential actions.** In AI SDK 7: `toolApproval: { issueRefund: 'user-approval', rollback: 'approved' }`. The loop pauses with a `tool-approval-request`, and you resume with a `tool-approval-response`. Decide by **reversibility and blast radius**: money out, deletes, external emails, prod changes.
4. **Idempotency.** Retries and replays happen (network, double-clicks, resumed approvals). Key side effects on the tool call id or a server-issued key.
5. **Budgets and kill switches.** Step, token and cost caps per run and per user, plus the ability to stop all agents.
6. **Audit everything.** Who asked, what the agent did, with which inputs, who approved.

**The lethal trifecta** (Simon Willison): an agent with (a) access to private data, (b) exposure to untrusted content (emails, web pages, tickets, *documents*) and (c) a way to communicate externally can be prompt-injected into exfiltrating data. Remove at least one leg for any flow that handles untrusted input.

## Web-engineering analogy
Approvals are a **two-person rule / change-approval workflow**. Policy-in-tools is **server-side validation**. The model is the client, and you never trust the client.

## Trade-offs
| More approvals | Fewer approvals |
|---|---|
| Safer, auditable | Faster, more autonomous |
| Approval fatigue: people click "yes" without reading | Higher blast radius per mistake |

Approve by risk (amount, reversibility, environment), and auto-approve the routine, low-risk path.

## ⚠️ Common mistakes
1. **"The system prompt forbids it."** Prompts are suggestions. Lab 05's "I am the CEO, pre-approved" message still hit the approval gate, because the gate is code.
2. **Waiting in memory for approval.** Persist messages and resume in a new request; the human may answer tomorrow.
3. **Model-generated idempotency keys**, which change on every retry.
4. **Showing the approver raw JSON.** Show what will happen in human terms: "Refund USD 99 to Ayesha Khan, invoice INV-20261003 (12 days old)".

## Senior check
You can threat-model an agent with the lethal trifecta, place approvals by risk, and explain how a paused approval survives a server restart.
