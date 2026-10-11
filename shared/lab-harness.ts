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
  console.log(`\n▶ ${path.basename(dir)} — checking ${target}\n`);
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
