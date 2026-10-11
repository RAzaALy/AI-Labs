import type { NextConfig } from 'next';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '../../..');

// One .env for the whole course: load the repo-root .env (Next.js itself only reads .env files in this folder).
// Variables already set in the environment win, so `LLM_PROVIDER=mock npm run dev` still works.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no .env yet → the app runs on the mock model
}

const config: NextConfig = {
  // This app lives inside the course monorepo; point Turbopack at the repo root (where node_modules is).
  turbopack: { root: repoRoot },
};

export default config;
