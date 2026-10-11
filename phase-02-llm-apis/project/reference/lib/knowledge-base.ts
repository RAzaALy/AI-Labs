// A tiny knowledge base (same runbook as Phase 1's X-ray fixtures). Phase 3 replaces this with real RAG.
export const KNOWLEDGE_BASE = [
  'To roll back a release, run `deploy rollback --to <version>` from the ops CLI.',
  'Postgres backups run nightly at 02:00 UTC and are retained for 30 days.',
  'Feature flags can be toggled in the admin dashboard without a redeploy.',
  'API rate limits are 600 requests per minute per API key; exceeding them returns HTTP 429.',
  'On-call engineers are paged through the incident channel when error rate exceeds 2%.',
  'New services must expose a /healthz endpoint that returns 200 when dependencies are reachable.',
  'Secrets are stored in the vault and injected as environment variables at deploy time.',
  'The staging environment is reset every Monday at 06:00 UTC.',
  'Logs are retained for 14 days in hot storage and one year in cold storage.',
  'Refunds are processed within 5 business days after approval by the billing team.',
  'Customers can change their login email under Settings → Account → Email.',
  'Duplicate charges are refunded automatically within 24 hours once confirmed by billing.',
];
