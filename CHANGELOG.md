# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

The pre-1.0 development series. Delivered so far (by SDLC phase):

### Added
- **Planning & design (Phases 0–1):** SRS, roadmap, architecture, database schema,
  API contract, STRIDE threat model, and engineering standards.
- **Authentication (Phase 2):** registration + email verification, login/logout,
  Argon2id password hashing, short-lived JWT access tokens, rotating refresh tokens with
  reuse detection, password change/reset. In-memory and PostgreSQL storage backends.
- **Authorization / RBAC (Phase 3):** deny-by-default permission guards; admin API for
  users, roles, permissions, and role assignment; `grant-admin` bootstrap CLI.
- **Security hardening (Phase 4):** account lockout, CSRF protection, security headers
  (helmet), JWT signing-key rotation, CI dependency scanning, `SECURITY.md`.
- **Testing & QA (Phase 5):** coverage-gated test suite (120 tests, ~98% line coverage).
- **Docs & packaging (Phases 6–7):** OpenAPI spec + Swagger UI, integration & deployment
  guides, contribution docs, Dockerfile, and release automation.
- **MFA / TOTP:** authenticator-app two-factor auth with a two-step login challenge,
  one-time recovery codes, and TOTP secrets encrypted at rest (AES-256-GCM).

### Fixed
- No-body `POST` requests sent with `Content-Type: application/json` (e.g. logout,
  MFA enroll) no longer error on an empty body.
- Fastify client errors (bad content-type, malformed body) now return the correct `4xx`
  status instead of `500`.

### Security
- No production-dependency vulnerabilities (audited in CI).

---

Release entries (e.g. `## [1.0.0]`) will be added here when versions are tagged.
