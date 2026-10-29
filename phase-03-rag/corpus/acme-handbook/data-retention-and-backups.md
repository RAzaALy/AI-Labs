---
title: Data retention and backups
owner: data-team
updated: 2026-06-18
status: current
---

# Data retention and backups

## Database backups

Postgres databases are backed up every night at 02:00 UTC with point-in-time recovery enabled, which allows restoring to any second within the last 7 days. Full nightly snapshots are kept for 30 days. Backups are encrypted with AES-256 and stored in a separate cloud account so that a compromised production account cannot delete them.

Restores are tested every quarter by restoring the largest production database into an isolated environment and running integrity checks. A backup that has never been restored is not a backup.

## Log retention

Application logs are kept for 14 days in hot storage, where they are searchable, and for one year in cold storage. Access logs that contain IP addresses are kept for 90 days only, for privacy reasons.

## Customer data deletion (GDPR)

When a customer deletes their workspace or sends a deletion request, their data is deleted from production systems within 30 days. Backups containing the data age out within a further 30 days, because backups are not edited individually. Deletion requests are logged with a ticket id so we can prove compliance.

## Data residency

Workspaces are pinned to a region when created: EU (Frankfurt) or US (Virginia). Data, backups and logs stay in that region. Moving a workspace between regions requires a migration ticket and planned downtime.
