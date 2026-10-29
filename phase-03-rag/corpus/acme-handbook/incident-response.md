---
title: Incident response
owner: sre-team
updated: 2026-08-30
status: current
---

# Incident response

An incident is any unplanned event that degrades service for customers. Anyone can declare one in the `#incidents` channel with `/incident declare`.

## Severity levels

| Severity | Definition | Response time | Who is paged |
|---|---|---|---|
| SEV1 | Full outage or data loss for many customers | 5 minutes | On-call engineer, on-call lead, CTO |
| SEV2 | Major feature broken or severe degradation | 15 minutes | On-call engineer and on-call lead |
| SEV3 | Minor feature broken, workaround exists | Next business day | Owning team |
| SEV4 | Cosmetic issue, no customer impact | Normal backlog | Owning team |

When in doubt, declare the higher severity. Downgrading later is cheap; a slow response to a real outage is not.

## Paging and on-call

On-call engineers are paged through PagerDuty when the error rate exceeds 2% for five minutes or when a synthetic check fails three times in a row. The on-call rotation changes every Monday at 10:00 PKT. An engineer who is paged must acknowledge within 5 minutes; unacknowledged pages escalate to the on-call lead.

## Roles during an incident

- **Incident commander:** coordinates the response and makes decisions. Usually the on-call lead.
- **Communications lead:** posts a status page update at least every 30 minutes for SEV1 and SEV2.
- **Responders:** investigate and fix. They report findings to the commander, not to customers.

## After the incident

Every SEV1 and SEV2 gets a blameless post-incident review within five business days. The review lists the timeline, the root cause, what went well, and action items with owners and due dates. Reviews focus on systems and processes, never on blaming individuals.

## Error budget

Each service has a monthly availability target of 99.9%, which allows about 43 minutes of downtime per month. When a service spends its whole error budget, feature work on that service pauses until reliability work brings it back within target.
