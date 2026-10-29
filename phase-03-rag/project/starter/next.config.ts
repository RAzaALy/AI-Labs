import type { NextConfig } from 'next';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '../../..');

// One .env for the whole course (DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY, LLM_PROVIDER...).
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no .env: mock model + local embeddings
}
// Share the course's model cache so MiniLM is downloaded once for labs and project.
process.env.MODEL_CACHE_DIR ??= path.join(repoRoot, '.cache/models');

const config: NextConfig = {
  turbopack: { root: repoRoot },
  // Native / WASM-heavy packages run in Node directly instead of being bundled.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'postgres'],
};

export default config;
