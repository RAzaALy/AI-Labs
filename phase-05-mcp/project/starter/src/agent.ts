// Your own MCP host: an agent that reaches Acme ONLY through the MCP server (no imports of OpsStore here).
//   npm run agent -- "The api is throwing errors. Fix it."              (asks you before any refund)
//   npm run agent -- --approve "Refund Ayesha's last charge"            (non-interactive approval, for scripts/tests)
import { createInterface } from 'node:readline/promises';
import { isStepCount, ToolLoopAgent, type LanguageModel } from 'ai';
import { describeModel, getModel } from '../../../../shared/llm.ts';
import './env.ts';
import { connectHttp, mcpTools, type Approver } from './mcp-tools.ts';
import { mockAgentModel } from './mock-model.ts';

export const INSTRUCTIONS = `You are Acme's operations agent. You act only through your tools; never invent data.
Look things up before acting and check the handbook for policy. If a tool returns an error, read it and adjust.
Finish with a short summary of what you did and what you did not do.`;

export async function runAgent(task: string, opts: { url: URL; token: string; approver: Approver; model?: LanguageModel }) {
  const client = await connectHttp(opts.url, opts.token, opts.approver);
  try {
    const agent = new ToolLoopAgent({ model: opts.model ?? getModel({ mock: mockAgentModel() }).model, instructions: INSTRUCTIONS, tools: await mcpTools(client), stopWhen: isStepCount(10), temperature: 0 });
    const r = await agent.generate({ prompt: task });
    return { text: r.text, steps: r.steps.length, calls: r.steps.flatMap((s) => s.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`)), inputTokens: r.totalUsage.inputTokens ?? 0 };
  } finally {
    await client.close();
  }
}

const isMain = process.argv[1]?.endsWith('agent.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a === '--approve' || a === '--deny');
  const task = args.filter((a) => !a.startsWith('--')).join(' ') || 'Is the api healthy?';
  const approver: Approver = async (q) => {
    if (flag) return console.error(`\n  ⏸  ${q}\n  → ${flag === '--approve' ? 'approved' : 'declined'} (${flag})`), flag === '--approve';
    if (!process.stdin.isTTY) return console.error(`\n  ⏸  ${q}\n  → declined (no terminal to ask; pass --approve)`), false;
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const a = await rl.question(`\n  ⏸  ${q}\n  Approve? [y/N] `);
    rl.close();
    return /^y(es)?$/i.test(a.trim());
  };
  const token = process.env.ACME_MCP_TOKEN ?? '';
  if (!token) throw new Error('Set ACME_MCP_TOKEN (one of the tokens in ACME_MCP_TOKENS) in the repo-root .env');
  console.error(`model: ${describeModel(getModel({ mock: mockAgentModel() }))}`);
  const r = await runAgent(task, { url: new URL(process.env.ACME_MCP_URL ?? 'http://localhost:3050/mcp'), token, approver });
  console.error(r.calls.map((c, i) => `  ${i + 1}. ${c.slice(0, 140)}`).join('\n'));
  console.log(`\n${r.text}\n`);
  console.error(`(${r.steps} steps · ${r.inputTokens} input tokens)`);
}
