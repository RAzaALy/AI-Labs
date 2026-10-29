---
title: Deploys and rollbacks
owner: platform-team
updated: 2026-09-14
status: current
---

# Deploys and rollbacks

Acme Cloud ships the `api`, `web` and `worker` services through a single pipeline. Every merge to `main` builds a container image, runs the test suite and deploys to staging automatically. Production deploys are manual and require one approval from a member of the platform team.

## Deploy windows

Production deploys are allowed Monday to Thursday between 09:00 and 16:00 Pakistan Standard Time (PKT). Friday deploys need written approval from the on-call lead, because a bad Friday change can hurt customers all weekend. During a declared incident (SEV1 or SEV2) all non-fix deploys are frozen.

## How to deploy

Run the deploy from the ops CLI, never from a laptop shell script:

```bash
acme deploy --service api --version 2026.09.14-3 --env production
```

The CLI performs a canary release: 5% of traffic for 10 minutes, then 25% for 10 minutes, then 100%. If the error rate of the canary exceeds 2% or p95 latency rises above 800 ms, the CLI stops the rollout and returns traffic to the previous version on its own.

## Rolling back a bad release

To undo a bad deployment, roll back to the last known-good version:

```bash
acme deploy rollback --service api --to 2026.09.13-1
```

A rollback takes about two minutes and does not need approval. Prefer rolling back over fixing forward when customers are affected: restore service first, investigate second. After any production rollback, open a post-incident review ticket within 24 hours.

## Database migrations and rollbacks

Database migrations must be backwards compatible with the previous release (the expand and contract pattern). This is what makes rolling back the application safe without touching the schema. Destructive migrations, such as dropping a column, ship at least one release after the code that stopped using the column.

## Feature flags instead of risky deploys

Large behaviour changes go behind a feature flag so they can be switched off without a deploy. See the feature flags guide for naming rules and the cleanup policy.
