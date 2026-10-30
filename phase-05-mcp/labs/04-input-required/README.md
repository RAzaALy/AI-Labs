# Lab 04: A person in the loop: `input_required` (≈60 min)

**Concept:** [05 input required and security](../../theory/05-input-required-and-security.md) · **Visualization:** [input-required.html](../../visualizations/input-required.html) · **No key, no database needed**

Phase 4 paused the *agent loop* for approval (`toolApproval`). Here the **server** asks: `issueRefund` returns `input_required`, the host asks a person, and the client retries. The server stores nothing in between, so the hard part is making round 2 trustworthy.

## Task
1. `digestArgs(args)`: canonical (sorted keys) sha256.
2. `describeRefund(ops, args)`: the consequence in words: amount, customer name, invoice, date, reason.
3. `createRefundServer(ops, { stateKey })`: a `createRequestStateCodec` (5-minute TTL, bound to method + caller) plugged into `requestState.verify`; `issueRefund` that dry-runs the policy, asks, verifies the args digest, honours decline, and refunds with **the state's nonce as the idempotency key**.
4. `elicitationHandler(approver)`: the client side: the server's question → a person → `accept` / `decline` / `cancel`.

## Run
```bash
npx tsx phase-05-mcp/labs/04-input-required/check.ts starter
```

## Measured when this lab was built (2026-10-31)
```
approver was asked: "Refund USD 99 to Ayesha Khan (C-101) on invoice INV-20261003 from 2026-10-03? Reason: Customer did not use the new seats"
wire: tools/call → tools/call + inputResponses
pre-filled approval        → resultType: input_required (asked again)
swapped invoice            → This approval was given for different refund details. Nothing was refunded…
state readable by client   → {"nonce":"2657d33c-…","argsDigest":"2xBCFmwB…"}
edited state               → -32602 Invalid or expired requestState
another user's state       → -32602
retry sent twice           → RF-1, then replayed=true (1 refund)
2025 client, no elicitation → isError "Cannot request input 'approval'…", no refund     → 9 passed in 1.8 s
```

## What to notice
- **The model sees one tool call and one result.** The question and the "yes" travel between the client and the person, outside the model's context. That's the point: the model can't approve its own refund.
- **Order matters.** The first draft dry-ran the policy on *every* round, so a replayed retry failed ("only USD 0 refundable") instead of returning the original refund. The dry run belongs in round 1 only; round 2 relies on the idempotency key.
- **Signed ≠ secret.** Decode the middle of the `requestState` and you'll see the nonce and digest. Never put secrets in it.
- **Old clients fail safe.** A 2025 host that can't ask a person gets an error. It never gets a refund.
