#!/usr/bin/env -S npx tsx
// LLM X-ray — STARTER. Arg parsing and help are done for you; implement the four commands.
// It imports YOUR lab code (labs/*/starter). If a lab isn't finished, switch that import to /solution.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { countTokens, tokenPieces } from '../../labs/01-tokens/starter/index.ts';
import { search } from '../../labs/02-embeddings/starter/index.ts';
import { loadModel, nextTokenLogits, sampleIndex, softmax, topK, topP } from '../../labs/03-sampling/starter/index.ts';
import { conversationInputTokens, fitToBudget, totalTokens, type Message } from '../../labs/04-context-budget/starter/index.ts';
import { PRICING, costUSD } from '../../../shared/pricing.ts';
import { seededRandom } from '../../../shared/rng.ts';

const HELP = `LLM X-ray: look inside what an LLM sees and costs.

Usage:
  xray tokens   <text> | --file <path>   [--out <tokens>]
  xray similar  --query <q> --file <docs.txt> [--k 3] [--min-score 0.3]
  xray generate <prompt> [--temperature 1] [--top-k 0] [--top-p 1] [--max-tokens 30] [--seed 42] [--show-probs]
  xray budget   --file <conversation.json> [--window 4096] [--reserve 1024]
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' },
    out: { type: 'string', default: '500' },
    query: { type: 'string' },
    k: { type: 'string', default: '3' },
    'min-score': { type: 'string', default: '0.3' },
    temperature: { type: 'string', default: '1' },
    'top-k': { type: 'string', default: '0' },
    'top-p': { type: 'string', default: '1' },
    'max-tokens': { type: 'string', default: '30' },
    seed: { type: 'string', default: '42' },
    'show-probs': { type: 'boolean', default: false },
    window: { type: 'string', default: '4096' },
    reserve: { type: 'string', default: '1024' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, ...rest] = positionals;
const num = (name: keyof typeof values) => {
  const n = Number(values[name]);
  if (!Number.isFinite(n)) fail(`--${name} must be a number`);
  return n;
};
function fail(msg: string): never {
  console.error(`error: ${msg}\n\n${HELP}`);
  process.exit(2);
}
const inputText = async () => (values.file ? await readFile(values.file, 'utf8') : rest.join(' '));

async function cmdTokens() {
  // TODO:
  //  1. text = await inputText(); fail() if empty
  //  2. print chars, gpt2 + o200k token counts, chars/token (use countTokens)
  //  3. print the o200k pieces (tokenPieces) — first 40, then "… +N more"
  //  4. console.table a cost row per model in PRICING: costUSD(model, o200kCount, --out)
  throw new Error('TODO: cmdTokens');
}

async function cmdSimilar() {
  // TODO:
  //  1. require --query and --file; docs = non-empty lines of the file
  //  2. hits = await search(query, docs, --k); print "1. 0.587  <doc>" per hit
  //  3. if best score < --min-score, print a warning containing "probably nothing relevant"
  //  4. if the top two scores are within 0.02, print a "nearly tied" warning
  throw new Error('TODO: cmdSimilar');
}

async function cmdGenerate() {
  // TODO: stream tokens as they are generated (do NOT use lab 03's generate(), which returns a full string)
  //  1. ids = tok.encode(prompt); rand = seededRandom(--seed); write the prompt to stdout
  //  2. loop --max-tokens: logits → softmax(T) → topK → topP → sampleIndex; stop on tok.eos_token_id
  //  3. process.stdout.write(tok.decode([next])) immediately; with --show-probs append "(NN%)"
  //  4. at the end print: "<n> tokens · TTFT <ms> ms · <x> tokens/s"   (time to first token matters in UX!)
  throw new Error('TODO: cmdGenerate');
}

async function cmdBudget() {
  // TODO:
  //  1. messages = JSON.parse(file) as Message[]
  //  2. r = fitToBudget(messages, { contextWindow: --window, reserveForOutput: --reserve })
  //  3. print "kept N messages (T tokens), dropped M oldest", then one "  ✂ role  content…" line per dropped message
  //  4. billing view: each assistant reply = one request that re-sent everything before it.
  //     Use conversationInputTokens() and print the multiple vs. the conversation size.
  throw new Error('TODO: cmdBudget');
}

if (values.help || !command) {
  console.log(HELP);
} else {
  const commands: Record<string, () => Promise<void>> = { tokens: cmdTokens, similar: cmdSimilar, generate: cmdGenerate, budget: cmdBudget };
  const run = commands[command];
  if (!run) fail(`unknown command "${command}"`);
  await run();
}
