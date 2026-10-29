---
title: Security and access
owner: security-team
updated: 2026-09-20
status: current
---

# Security and access

## Accounts and sign-in

All employees sign in through single sign-on (SSO) with the company identity provider. Multi-factor authentication (MFA) with a hardware key or authenticator app is mandatory; SMS codes are not accepted. Shared accounts are not allowed: every action must be traceable to a person.

## Secrets management

Secrets such as database passwords and API keys live in the vault and are injected as environment variables at deploy time. Never commit secrets to git, paste them into chat, or store them in a `.env` file on a shared server. If a secret leaks, rotate it immediately and open a security incident.

## Key rotation

Production API keys and database credentials are rotated every 90 days. Customer-facing API keys expire after 365 days; customers get reminder emails 30 days and 7 days before expiry.

## Access reviews

Access to production systems is reviewed every quarter by each team lead. Anyone who changed teams or no longer needs access is removed. Production database access is read-only by default; write access is granted per incident and expires after 8 hours.

## Reporting a security issue

Report suspected vulnerabilities or phishing to security@acme.example or in the `#security` channel. For an active security incident, page the security on-call through PagerDuty. The security team aims to triage reports within 4 business hours.
