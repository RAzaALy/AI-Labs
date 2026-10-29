---
title: Rate limits and quotas
owner: api-team
updated: 2026-09-02
status: current
---

# Rate limits and quotas

Rate limits protect the platform from bursts and keep latency predictable for everyone. They apply per API key, per minute.

## Limits per plan

| Plan | Requests per minute | Burst | Webhook deliveries per hour |
|---|---|---|---|
| Starter | 120 | 20 | 1,000 |
| Team | 600 | 100 | 10,000 |
| Business | 3,000 | 500 | 100,000 |
| Enterprise | Negotiated | Negotiated | Negotiated |

Exceeding the limit returns HTTP 429 with error code E-4290 and a `Retry-After` header in seconds.

## Handling 429 responses

Clients should wait at least the `Retry-After` value, then retry with exponential backoff and random jitter. Retrying immediately or in a tight loop makes the problem worse and can get a key temporarily blocked for 15 minutes.

## Monthly quotas

Besides per-minute limits, each plan has a monthly quota of stored events: 1 million on Starter, 20 million on Team and 200 million on Business. When a workspace reaches 80% of its quota, the account owner receives an email warning. At 100%, new events are rejected until the next billing period or an upgrade.

## Raising limits

Business and Enterprise customers can request a temporary limit increase for launches or migrations through their account manager, with at least five business days of notice.
