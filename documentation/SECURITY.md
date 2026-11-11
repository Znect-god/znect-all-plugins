# Security Policy

## Reporting a vulnerability

Do not publish exploitable details, credentials, tokens, or private logs in public issues. Report security concerns privately to the repository maintainer through an appropriate private GitHub channel. If no private reporting channel is configured, contact the maintainer before disclosing details publicly.

## Secrets and sensitive data

Never commit:
- API keys, access tokens, passwords, private keys, certificates, or session cookies;
- production environment files containing secret values;
- personal or customer data;
- unredacted CI logs or diagnostic dumps that may contain secrets.

Commit only example environment files with clearly fake placeholders. Store real values in the relevant hosting or CI secret manager. Never ask a user to paste secret values into an issue or chat.

## Permissions and network access

Each plugin must document:
- required permissions and why they are needed;
- outbound destinations and protocols;
- authentication method;
- data collected, processed, and retained;
- whether actions are read-only or can modify external systems.

Prefer least privilege, fixed destination allowlists, strict input validation, safe redirect handling, and bounded response sizes.

## Dependencies

Review dependency advisories and package provenance. Record unresolved vulnerabilities and explain the impact. Do not use forceful automated dependency upgrades without reviewing the resulting changes.

## Logs

Treat build logs, traces, and artifacts as potentially sensitive. Redact credentials and personal data before sharing. Apply access controls and retention limits appropriate to the data.

## Prototype warning

Prototype status is not a security assessment. Do not connect experimental plugins to sensitive production accounts or data until their threat model and security controls have been reviewed.
