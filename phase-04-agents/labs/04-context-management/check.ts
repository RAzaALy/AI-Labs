// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import { z } from 'zod';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel } from '../../../shared/mock-model.ts';
import { searchHandbook } from '../../env/acme-ops.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const TASK = 'Prepare an on-call cheat sheet: the refund window, the canary error-rate threshold that stops a deploy, and how fast a SEV1 page must be acknowledged. Research each, save each fact as a note, then answer from your notes.';
const search = tool({
  description: 'Search the Acme handbook. Returns the 3 best sections in full.',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => (await searchHandbook(query, 3)).map((h) => ({ source: `${h.file} › ${h.section}`, text: h.text })),
});

const researchScript = () =>
  scriptedModel([
    { toolCalls: [{ name: 'search', input: { query: 'refund window' } }] },
    { toolCalls: [{ name: 'saveNote', input: { note: 'Refunds: within 30 days of the charge (billing-and-refunds.md)' } }] },
    { toolCalls: [{ name: 'search', input: { query: 'canary error rate deploy' } }] },
    { toolCalls: [{ name: 'saveNote', input: { note: 'Canary stops above 2% errors or p95 > 800 ms (deploys-and-rollbacks.md)' } }] },
    { toolCalls: [{ name: 'search', input: { query: 'SEV1 page acknowledge minutes' } }] },
    { toolCalls: [{ name: 'saveNote', input: { note: 'Pages must be acknowledged within 5 minutes (incident-response.md)' } }] },
    { toolCalls: [{ name: 'readNotes', input: {} }] },
    { text: 'Refunds within 30 days · canary stops above 2% errors · acknowledge pages within 5 minutes.' },
  ]);

async function run(model: LanguageModel, compact: boolean, notes: string[], enforceNotes = false) {
  const perStep: number[] = [];
  let lastMessages: ModelMessage[] = [];
  const r = await generateText({
    model,
    instructions: 'You research the Acme handbook with tools. Save each fact you need with saveNote as soon as you find it.',
    prompt: TASK,
    tools: { search, ...lab.notesTools(notes) } as ToolSet,
    stopWhen: isStepCount(12),
    temperature: 0,
    prepareStep: async (opts) => {
      const fns = [...(compact ? [lab.compactingPrepareStep(900, 1)] : []), ...(enforceNotes ? [lab.notesAfterSearch('search')] : [])];
      const out = await lab.combinePrepareSteps(...fns)(opts);
      lastMessages = (out as { messages?: ModelMessage[] }).messages ?? opts.messages;
      perStep.push(lab.estimateTokens(lastMessages));
      return out;
    },
  });
  return { perStep, total: perStep.reduce((a, b) => a + b, 0), text: r.text, lastMessages };
}

const toolMsg = (id: string, name: string, value: unknown): ModelMessage => ({ role: 'tool', content: [{ type: 'tool-result', toolCallId: id, toolName: name, output: { type: 'json', value: value as never } }] });
const callMsg = (id: string, name: string): ModelMessage => ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: name, input: {} }] });

await report('clearOldToolResults keeps the calls and the newest results, and stays a valid history', () => {
  const big = { text: 'x '.repeat(500) };
  const msgs: ModelMessage[] = [{ role: 'user', content: 'go' }, callMsg('a', 'search'), toolMsg('a', 'search', big), callMsg('b', 'saveNote'), toolMsg('b', 'saveNote', { saved: 1 }), callMsg('c', 'search'), toolMsg('c', 'search', big)];
  const out = lab.clearOldToolResults(msgs, 1);
  assert.equal(out.length, msgs.length, 'never drop messages: every tool call needs its result');
  const outputs = out.flatMap((m) => (m.role === 'tool' ? m.content : [])) as { toolCallId: string; output: { type: string; value: unknown } }[];
  assert.match(String(outputs[0]!.output.value), /cleared: search/);
  assert.deepEqual(outputs[1]!.output, { type: 'json', value: { saved: 1 } }, 'notes are never cleared');
  assert.deepEqual(outputs[2]!.output.value, big, 'the newest result stays intact');
  assert.ok(lab.estimateTokens(out) < lab.estimateTokens(msgs) * 0.7, 'one of the two big results must be gone');
  assert.equal(JSON.stringify(msgs[2]), JSON.stringify(toolMsg('a', 'search', big)), 'do not mutate the input');
});

await report('compaction cuts the tokens billed over a research run, and notes keep the facts', async () => {
  const notesA: string[] = [];
  const notesB: string[] = [];
  const full = await run(researchScript(), false, notesA);
  const compacted = await run(researchScript(), true, notesB);
  console.log(`   per-step context, no compaction: ${full.perStep.join(' → ')} (total ${full.total})`);
  console.log(`   per-step context, compaction:    ${compacted.perStep.join(' → ')} (total ${compacted.total})`);
  console.log(`   saved ${Math.round((1 - compacted.total / full.total) * 100)}% of input tokens`);
  assert.ok(compacted.total < full.total * 0.8, 'expect at least 20% fewer tokens');
  assert.equal(notesB.length, 3);
  const last = JSON.stringify(compacted.lastMessages);
  assert.match(last, /cleared: search/, 'old search results were cleared');
  for (const fact of ['30 days', '2%', '5 minutes']) assert.ok(last.includes(fact), `the note "${fact}" still reaches the model after clearing`);
});

await report('notesAfterSearch: after a search step, the only allowed tool is saveNote', async () => {
  const step = (names: string[]) => ({ toolCalls: names.map((toolName) => ({ toolName })) });
  const fn = lab.notesAfterSearch('search');
  assert.deepEqual(await fn({ steps: [step(['search', 'search'])] } as never), { activeTools: ['saveNote'], toolChoice: 'required' });
  assert.deepEqual(await fn({ steps: [step(['saveNote'])] } as never), {});
  const both = await lab.combinePrepareSteps(lab.compactingPrepareStep(0, 1), fn)({ steps: [step(['search'])], messages: [{ role: 'user', content: 'x' }] } as never);
  assert.ok(both && 'messages' in both && 'activeTools' in both, 'combined: compaction AND tool restriction');
});

await liveOnly('a real model researches with compaction + enforced notes and answers correctly', live, async () => {
  const notes: string[] = [];
  const r = await run(getModel().model, true, notes, true);
  console.log(`   per-step context: ${r.perStep.join(' → ')} · notes: ${notes.length}\n   answer: ${r.text.replace(/\s+/g, ' ').slice(0, 220)}`);
  assert.match(r.text, /30/);
  assert.match(r.text, /2\s?%/);
  assert.match(r.text, /5 min/);
});

summary();
