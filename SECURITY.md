# Security Policy

Saim-AUS is a security-focused project. We take vulnerabilities seriously and
appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately via one of:

- GitHub's **[Report a vulnerability](https://github.com/Sameergit23/Saim-AUS/security/advisories/new)**
  (Security → Advisories), or
- a direct message to the maintainer.

Please include:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version / commit
- Any suggested remediation

We aim to acknowledge reports within a few days and to provide a remediation
timeline after triage. Please give us a reasonable window to fix the issue
before any public disclosure.

## Scope

In scope: the Saim-AUS service and library code in this repository
(authentication, authorization/RBAC, token handling, storage adapters).

Out of scope: vulnerabilities in third-party dependencies (report those
upstream, though we welcome a heads-up), and issues that require a
pre-compromised host or leaked signing key (see the deployment notes).

## Supported versions

The project is pre-1.0. Security fixes are applied to the `main` branch and
released as patch versions.

## Security posture (summary)

- Passwords hashed with **Argon2id**; secrets/tokens stored only as hashes.
- Short-lived JWT access tokens + rotating refresh tokens with reuse detection.
- Deny-by-default authorization on all privileged operations.
- Account lockout, rate limiting, CSRF protection, and security headers.
- Dependency vulnerability scanning runs in CI.

See [docs/design/04-Threat-Model.md](docs/design/04-Threat-Model.md) for the full
threat model.
