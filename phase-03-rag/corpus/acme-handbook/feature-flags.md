---
title: Feature flags
owner: platform-team
updated: 2026-05-11
status: current
---

# Feature flags

Feature flags let us ship code without exposing it, roll out gradually, and switch off a misbehaving feature without a deploy.

## Creating a flag

Create flags in the admin dashboard under Settings, then Feature flags. Names use kebab-case with the owning team as a prefix, for example `billing-new-invoice-pdf`. Every flag needs an owner and an expected removal date.

## Rolling out

Start with internal users, then 5% of workspaces, then 25%, then 100%. Watch error rates and the relevant product metric at each step. A rollout can be paused or reverted instantly from the dashboard; changes apply within 30 seconds.

## Kill switches

Risky integrations, such as third-party payment providers, sit behind a permanent kill switch flag so that on-call engineers can disable them during an incident without needing a deploy.

## Cleanup policy

Temporary flags must be removed within 60 days of reaching 100% rollout. Each team reviews its flags in the first sprint of every month. Old flags make code harder to read and test, because every flag doubles the number of possible paths.
