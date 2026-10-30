// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel } from '../../../shared/mock-model.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tsx = path.join(root, 'node_modules/.bin/tsx');
const server = (name: string) => [path.join(root, 'phase-05-mcp/env/servers', `${name}.ts`)];
const connect = async () => Promise.all([lab.connectStdio('acme', tsx, server('acme')), lab.connectStdio('status', tsx, server('status'))]);
const callsOf = (steps: { toolCalls: { toolName: string; input: unknown }[] }[]) => steps.flatMap((s) => s.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`));

await report('connectStdio starts the server and negotiates the 2026-07-28 protocol', async () => {
  const [acme, status] = await connect();
  try {
    assert.equal(acme.client.getProtocolEra(), 'modern', "pass versionNegotiation: { mode: 'auto' }: the default is the 2025 handshake");
    assert.equal(acme.client.getServerVersion()?.name, 'acme-ops');
    assert.equal(status.client.getServerVersion()?.name, 'status-page');
  } finally {
    await lab.closeAll([acme, status]);
  }
});

await report('MCP tools become AI SDK tools: prefixed names, structured results, errors thrown', async () => {
  const [acme, status] = await connect();
  try {
    const tools = await lab.toAiSdkTools(acme);
    console.log(`   ${Object.keys(tools).join(', ')}`);
    assert.ok('acme__getDeployStatus' in tools && 'acme__rollback' in tools);
    const exec = (name: string, input: unknown) => (tools[name]!.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, { toolCallId: 't1', messages: [] });
    const out = (await exec('acme__getDeployStatus', { service: 'api' })) as { status: string; version: string };
    assert.equal(out.status, 'degraded', 'return structuredContent (an object) when the server sends it');
    await assert.rejects(
      async () => exec('acme__rollback', { service: 'web' }),
      /healthy/,
      'a tool result with isError: true must reach the model as a tool error (throw with the server text)',
    );
    void status;
  } finally {
    await lab.closeAll([acme, status]);
  }
});

await report('two servers, one tool name: merging refuses collisions, prefixes resolve them', async () => {
  const [acme, status] = await connect();
  try {
    const bare = [await lab.toAiSdkTools(acme, { prefix: false }), await lab.toAiSdkTools(status, { prefix: false })];
    assert.throws(() => lab.mergeToolSets(...bare), /getDeployStatus/, 'both servers expose getDeployStatus: a silent overwrite hides one of them');
    const merged = lab.mergeToolSets(await lab.toAiSdkTools(acme), await lab.toAiSdkTools(status));
    console.log(`   merged: ${Object.keys(merged).length} tools (acme__getDeployStatus and status__getDeployStatus both kept)`);
    assert.ok('acme__getDeployStatus' in merged && 'status__getDeployStatus' in merged);
  } finally {
    await lab.closeAll([acme, status]);
  }
});

await report('every connected server costs tokens on every request', async () => {
  const [acme, status] = await connect();
  try {
    const [a, s] = [await lab.definitionTokens(acme), await lab.definitionTokens(status)];
    console.log(`   tool definitions: acme ${a} tokens · status ${s} tokens · both ${a + s} tokens, re-sent at every agent step`);
    assert.ok(a > 300 && a < 1500 && s > 50 && s < a, `implausible counts: ${a}, ${s}`);
  } finally {
    await lab.closeAll([acme, status]);
  }
});

await report('an agent fixes the api through two MCP servers, and the server state proves it', async () => {
  const conns = await connect();
  try {
    const tools = lab.mergeToolSets(...(await Promise.all(conns.map((c) => lab.toAiSdkTools(c)))));
    const model = scriptedModel([
      { toolCalls: [{ name: 'status__getDeployStatus', input: { component: 'api' } }, { name: 'acme__getDeployStatus', input: { service: 'api' } }] },
      { toolCalls: [{ name: 'acme__rollback', input: { service: 'api' } }] },
      { toolCalls: [{ name: 'acme__createTicket', input: { subject: 'Post-incident review: api rollback', body: 'api 2026.10.15-2 degraded (6.4%), rolled back.', priority: 'high' } }] },
      { text: 'The api was degraded (6.4% errors, INC-77 on the status page). I rolled it back to 2026.10.14-1 and opened a post-incident review.' },
    ]);
    const r = await lab.createMcpAgent(model, tools).generate({ prompt: 'Customers say the API is failing. Fix it.' });
    console.log(`   ${callsOf(r.steps).join(' → ')}`);
    // Grade the server's world, through the same protocol: the change happened in another process.
    const after = await conns[0]!.client.callTool({ name: 'getDeployStatus', arguments: { service: 'api' } });
    assert.equal((after.structuredContent as { status: string }).status, 'healthy');
  } finally {
    await lab.closeAll(conns);
  }
});

await report("the AI SDK's MCP client gives you the same tools in one call", async () => {
  const { tools, close } = await lab.aiSdkMcpTools(tsx, server('acme'));
  try {
    assert.deepEqual(Object.keys(tools).sort(), ['createTicket', 'findCustomers', 'getDeployStatus', 'listInvoices', 'rollback', 'searchHandbook']);
  } finally {
    await close();
  }
});

await liveOnly('a real model works through both servers', live, async () => {
  const conns = await connect();
  try {
    const tools = lab.mergeToolSets(...(await Promise.all(conns.map((c) => lab.toAiSdkTools(c)))));
    const r = await lab.createMcpAgent(getModel().model, tools).generate({
      prompt: 'Customers report API errors. Check what the public status page says, then investigate and fix it following our handbook, including any follow-up the handbook requires.',
    });
    const calls = callsOf(r.steps);
    console.log(`   ${calls.join('\n   → ')}\n   ${r.steps.length} steps · ${r.totalUsage.inputTokens} input tokens · "${r.text.slice(0, 160)}"`);
    const after = await conns[0]!.client.callTool({ name: 'getDeployStatus', arguments: { service: 'api' } });
    assert.equal((after.structuredContent as { status: string }).status, 'healthy', 'api must be rolled back');
    assert.ok(calls.some((c) => c.startsWith('status__')), 'the task asked to check the status page');
    assert.ok(calls.some((c) => c.startsWith('acme__createTicket')), 'the handbook requires a post-incident review ticket');
  } finally {
    await lab.closeAll(conns);
  }
});

summary();
