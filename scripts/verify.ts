// Runs every lab solution and project reference check, so you (and CI) know the curriculum code works.
// Usage: npm run verify              (all phases, MOCK model: offline, free, deterministic)
//        npm run verify -- phase-02   (one phase)
//        npm run verify:live          (uses the real provider from .env — spends free-tier quota)
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');
const filter = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';

async function exists(p: string) {
  return stat(p).then(() => true, () => false);
}

function runCheck(file: string, target: string): Promise<{ ok: boolean; ms: number; out: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const env = live ? { ...process.env, LIVE: '1' } : { ...process.env, LLM_PROVIDER: 'mock' };
    const child = spawn('npx', ['tsx', file, target], { cwd: root, env });
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

// Phase 3+ need Postgres. Say so up front instead of letting every check fail with ECONNREFUSED.
if (phases.some((p) => p >= 'phase-03')) {
  try {
    process.loadEnvFile(path.join(root, '.env'));
  } catch {}
  const url = new URL(process.env.DATABASE_URL_TEST ?? 'postgres://app:app@localhost:5433/rag_test');
  const up = await new Promise<boolean>((resolve) => {
    const sock = connect(Number(url.port || 5432), url.hostname, () => (sock.end(), resolve(true)));
    sock.on('error', () => resolve(false));
  });
  if (!up) console.log(`⚠️  Postgres is not reachable at ${url.hostname}:${url.port}: phase 3+ checks will fail. Start it with: npm run db:up\n`);
}

console.log(live ? '▶ LIVE mode: using the provider configured in .env\n' : '▶ MOCK mode: no API calls (use npm run verify:live for real models)\n');
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
