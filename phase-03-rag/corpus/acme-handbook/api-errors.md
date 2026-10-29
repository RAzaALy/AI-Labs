---
title: API error reference
owner: api-team
updated: 2026-09-02
status: current
---

# API error reference

Every error response has an HTTP status and an Acme error code in the body: `{"error": {"code": "E-4012", "message": "..."}}`. Always quote the code when contacting support; it identifies the failing check precisely.

## Authentication errors

- **E-4001 Missing API key:** the request had no `Authorization` header. Send `Authorization: Bearer <key>`.
- **E-4003 Key revoked:** the key was revoked, usually during a rotation. Create a new key in Settings, then API keys.
- **E-4004 Key expired:** keys expire after 365 days. Rotate before expiry to avoid downtime.

## Request errors

- **E-4012 Invalid webhook signature:** the `Acme-Signature` header did not match the payload. Recompute the HMAC-SHA256 with the webhook secret over the raw request body, not the parsed JSON.
- **E-4013 Payload too large:** request bodies are limited to 1 MB. Upload larger files through the Files API instead.
- **E-4015 Unsupported region:** the workspace is pinned to a data region (EU or US) and the request targeted the other one.

## Rate limit errors

- **E-4290 Rate limit exceeded:** returned with HTTP 429. Wait for the number of seconds in the `Retry-After` header before retrying. See the rate limits guide for the limits per plan.

## Server errors

- **E-5000 Internal error:** an unexpected failure on our side. Retry with exponential backoff; if it persists, contact support with the `request-id` header value.
- **E-5030 Maintenance:** the service is in a scheduled maintenance window. Maintenance windows are announced on the status page 72 hours in advance.
