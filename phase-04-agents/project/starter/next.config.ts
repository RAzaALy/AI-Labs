import type { NextConfig } from 'next';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '../../..');

// One .env for the whole course (DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY, LLM_PROVIDER...).
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no .env: mock model + local embeddings
}
process.env.MODEL_CACHE_DIR ??= path.join(repoRoot, '.cache/models');

const config: NextConfig = {
  turbopack: { root: repoRoot },
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'postgres'],
};

export default config;
