// Runs every lab solution and project reference check, so you (and CI) know the curriculum code works.
// Usage: npm run verify            (all phases)
//        npm run verify -- phase-01 (one phase)
import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filter = process.argv[2] ?? '';

async function exists(p: string) {
  return stat(p).then(() => true, () => false);
}

function runCheck(file: string, target: string): Promise<{ ok: boolean; ms: number; out: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', file, target], { cwd: root });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ ok: code === 0, ms: Date.now() - started, out }));
  });
}

const phases = (await readdir(root)).filter((d) => d.startsWith('phase-') && d.includes(filter)).sort();
const jobs: { name: string; file: string; target: string }[] = [];
for (const phase of phases) {
  const labsDir = path.join(root, phase, 'labs');
  if (await exists(labsDir)) {
    for (const lab of (await readdir(labsDir)).sort()) {
      const check = path.join(labsDir, lab, 'check.ts');
      if (await exists(check)) jobs.push({ name: `${phase}/labs/${lab}`, file: check, target: 'solution' });
    }
  }
  const projectCheck = path.join(root, phase, 'project', 'check.ts');
  if (await exists(projectCheck)) jobs.push({ name: `${phase}/project`, file: projectCheck, target: 'reference' });
}

let failed = 0;
for (const job of jobs) {
  process.stdout.write(`… ${job.name}`);
  const r = await runCheck(job.file, job.target);
  process.stdout.write(`\r${r.ok ? '✅' : '❌'} ${job.name} (${(r.ms / 1000).toFixed(1)}s)\n`);
  if (!r.ok) {
    failed++;
    console.log(r.out.split('\n').filter((l) => !/warn/i.test(l)).map((l) => '   ' + l).join('\n'));
  }
}
console.log(`\n${jobs.length - failed}/${jobs.length} checks passed`);
process.exitCode = failed ? 1 : 0;
