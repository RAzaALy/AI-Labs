// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { AcmeOps } from '../../../phase-04-agents/env/acme-ops.ts';
import { connectInProcess, textOf } from '../../env/in-process.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);

const KEY = 'lab04-test-key-0123456789abcdef-0123456789';
const AYESHA = { invoiceId: 'INV-20261003', amountUSD: 99, reason: 'Customer did not use the new seats' };
const alice = { token: 't-a', clientId: 'billing-alice', scopes: [], expiresAt: 2e9 };
const mallory = { token: 't-m', clientId: 'support-mallory', scopes: [], expiresAt: 2e9 };

function setup(answer: Awaited<ReturnType<Parameters<Impl['elicitationHandler']>[0]>>) {
  const ops = new AcmeOps();
  const asked: string[] = [];
  const handler = lab.elicitationHandler(async (req) => (asked.push(req.message), answer));
  return { ops, asked, connect: (authInfo = alice) => connectInProcess(() => lab.createRefundServer(ops, { stateKey: KEY }), { authInfo, elicit: handler as never }) };
}

await report('digestArgs is canonical: same arguments in any order → same digest', async () => {
  assert.equal(lab.digestArgs({ a: 1, b: 'x' }), lab.digestArgs({ b: 'x', a: 1 }));
  assert.notEqual(lab.digestArgs({ a: 1 }), lab.digestArgs({ a: 2 }));
});

await report('the approver sees the consequence, and approving refunds exactly once', async () => {
  const { ops, asked, connect } = setup({ approve: true, note: 'ok per policy' });
  const { client, wire } = await connect();
  const r = await client.callTool({ name: 'issueRefund', arguments: AYESHA });
  console.log(`   approver was asked: "${asked[0]}"`);
  console.log(`   wire: ${wire.filter((w) => w.method === 'tools/call').map((w) => (w.body.includes('inputResponses') ? 'tools/call + inputResponses' : 'tools/call')).join(' → ')}`);
  assert.equal(asked.length, 1);
  assert.match(asked[0]!, /USD 99/);
  assert.match(asked[0]!, /Ayesha Khan/, 'name the customer, not just the invoice id');
  assert.ok(!r.isError, textOf(r));
  assert.equal((r.structuredContent as { refunded: boolean }).refunded, true);
  assert.equal(ops.world.refunds.length, 1);
  assert.equal(ops.world.refunds[0]!.invoiceId, 'INV-20261003');
});

await report('declining refunds nothing, and says so', async () => {
  const { ops, connect } = setup({ approve: false });
  const { client } = await connect();
  const r = await client.callTool({ name: 'issueRefund', arguments: AYESHA });
  console.log(`   result: ${textOf(r)}`);
  assert.equal((r.structuredContent as { refunded: boolean }).refunded, false);
  assert.match(textOf(r), /nothing was refunded/i, 'the model must learn that nothing happened');
  assert.equal(ops.world.refunds.length, 0);
});

await report('a refund that breaks policy fails at once: no human is asked', async () => {
  const { ops, asked, connect } = setup({ approve: true });
  const { client } = await connect();
  const r = await client.callTool({ name: 'issueRefund', arguments: { invoiceId: 'INV-20260903', amountUSD: 99, reason: 'Late request' } });
  console.log(`   ${textOf(r)}`);
  assert.equal(r.isError, true);
  assert.match(textOf(r), /42 days/);
  assert.equal(asked.length, 0, "don't spend a person's attention on a refund that would fail anyway");
  assert.equal(ops.world.refunds.length, 0);
});

await report('a client cannot pre-approve: approval without the server-issued state is a new request', async () => {
  const { ops, connect } = setup({ approve: true });
  const { rawCall } = await connect();
  const r = await rawCall('issueRefund', { arguments: AYESHA, inputResponses: { approval: { action: 'accept', content: { approve: true } } } });
  console.log(`   resultType: ${r.result?.resultType}`);
  assert.equal(r.result?.resultType, 'input_required', 'an answer to a question the server never asked must not count');
  assert.equal(ops.world.refunds.length, 0);
});

await report('an approval is bound to its arguments: swapping invoice or amount is refused', async () => {
  const { ops, connect } = setup({ approve: true });
  const { rawCall } = await connect();
  const first = await rawCall('issueRefund', { arguments: AYESHA });
  const state = first.result!.requestState as string;
  assert.ok(state, 'round 1 must return a requestState');
  const yes = { approval: { action: 'accept', content: { approve: true } } };
  const swapped = await rawCall('issueRefund', { arguments: { invoiceId: 'INV-20261001', amountUSD: 399, reason: AYESHA.reason }, inputResponses: yes, requestState: state });
  console.log(`   swapped invoice → ${swapped.result?.isError ? textOf(swapped.result as never) : JSON.stringify(swapped.error ?? swapped.result).slice(0, 120)}`);
  assert.ok(swapped.error || swapped.result?.isError, 'must be refused');
  assert.equal(ops.world.refunds.length, 0);
  const body = JSON.parse(Buffer.from(state.split('.')[1]!, 'base64url').toString());
  console.log(`   the state is readable by the client (signed, not encrypted): ${JSON.stringify(body.p)}`);
  const forged = `v1.${Buffer.from(JSON.stringify({ ...body, p: { ...body.p, argsDigest: lab.digestArgs({ ...AYESHA, amountUSD: 1 }) } })).toString('base64url')}.${state.split('.')[2]}`;
  const tampered = await rawCall('issueRefund', { arguments: { ...AYESHA, amountUSD: 1 }, inputResponses: yes, requestState: forged });
  console.log(`   edited state → ${tampered.error?.code} ${tampered.error?.message}`);
  assert.equal(tampered.error?.code, -32602, 'sign the state (createRequestStateCodec) and verify it before the handler runs');
  assert.equal(ops.world.refunds.length, 0);
});

await report('an approval is bound to its caller: another user cannot finish it', async () => {
  const { ops, connect } = setup({ approve: true });
  const a = await connect(alice);
  const m = await connect(mallory);
  const state = (await a.rawCall('issueRefund', { arguments: AYESHA })).result!.requestState as string;
  const r = await m.rawCall('issueRefund', { arguments: AYESHA, inputResponses: { approval: { action: 'accept', content: { approve: true } } }, requestState: state });
  assert.equal(r.error?.code, -32602, "bind the state to the caller's identity (codec `bind`)");
  assert.equal(ops.world.refunds.length, 0);
});

await report('replaying the approved retry refunds once (the state nonce is the idempotency key)', async () => {
  const { ops, connect } = setup({ approve: true });
  const { rawCall } = await connect();
  const state = (await rawCall('issueRefund', { arguments: AYESHA })).result!.requestState as string;
  const retry = () => rawCall('issueRefund', { arguments: AYESHA, inputResponses: { approval: { action: 'accept', content: { approve: true } } }, requestState: state });
  const [r1, r2] = [await retry(), await retry()];
  console.log(`   first: ${JSON.stringify(r1.result?.structuredContent)} · second: replayed=${r2.result?.structuredContent?.replayed}`);
  assert.equal(ops.world.refunds.length, 1);
  assert.equal(r2.result?.structuredContent?.replayed, true);
});

await report("a client that can't ask a person gets an error, not a refund", async () => {
  const ops = new AcmeOps();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await lab.createRefundServer(ops, { stateKey: KEY }).connect(serverSide);
  const client = new Client({ name: 'old-host', version: '1.0.0' }); // 2025 protocol, no elicitation capability
  await client.connect(clientSide as never);
  const r = await client.callTool({ name: 'issueRefund', arguments: AYESHA });
  console.log(`   ${textOf(r).slice(0, 140)}`);
  assert.equal(r.isError, true);
  assert.equal(ops.world.refunds.length, 0);
  await client.close();
});

summary();
