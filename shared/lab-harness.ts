// Tiny test harness for labs: `npx tsx labs/<lab>/check.ts [starter|solution]`.
// Loads ./<target>/index.ts next to the calling check.ts, runs named checks, and sets the exit code.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import './local-models.ts'; // pins the model cache dir before any lab loads a model

let passed = 0;
let failed = 0;

export async function loadImpl<T>(checkFileUrl: string): Promise<T> {
  const target = process.argv[2] ?? 'starter';
  if (!['starter', 'solution'].includes(target)) throw new Error(`target must be "starter" or "solution", got "${target}"`);
  const dir = path.dirname(fileURLToPath(checkFileUrl));
  const mode = process.env.LLM_PROVIDER === 'mock' ? 'mock model' : process.env.LLM_PROVIDER ? `live: ${process.env.LLM_PROVIDER}` : 'auto (.env)';
  console.log(`\n▶ ${path.basename(dir)} — checking ${target} · ${mode}\n`);
  return (await import(pathToFileURL(path.join(dir, target, 'index.ts')).href)) as T;
}

export async function report(name: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ ${name}\n   ${msg.split('\n').join('\n   ')}`);
  }
}

export function summary(): void {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

/** Run a check only against a real provider (skipped, not failed, in mock mode). */
export async function liveOnly(name: string, live: boolean, fn: () => unknown | Promise<unknown>): Promise<void> {
  if (!live) {
    console.log(`⏭️  ${name} (live only: set a key in .env and run without LLM_PROVIDER=mock)`);
    return;
  }
  await report(`${name} [live]`, fn);
}
