// CLI scripts get the same environment the Next.js app gets from next.config.ts.
import path from 'node:path';

export const repoRoot = path.join(import.meta.dirname, '../../../..');
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {}
process.env.MODEL_CACHE_DIR ??= path.join(repoRoot, '.cache/models');
