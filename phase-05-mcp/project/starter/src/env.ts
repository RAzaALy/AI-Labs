// Loads the repo-root .env (keys, DATABASE_URL, tokens). Nothing secret lives in this folder.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'));
} catch {}

/** The multi-round-trip state key: required, ≥ 32 characters, never a default baked into the code. */
export function stateKey(): string {
  const key = process.env.ACME_STATE_KEY ?? '';
  if (key.length < 32) {
    console.error('ACME_STATE_KEY must be set (≥ 32 characters) in the repo-root .env. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"');
    process.exit(1);
  }
  return key;
}
