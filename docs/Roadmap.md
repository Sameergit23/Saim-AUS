# SDLC Roadmap
## Saim-AUS — Authentication & Authorization System

**Version:** 0.1 (Draft)
**Date:** 2026-09-22
**Methodology:** Iterative / incremental SDLC (waterfall-style planning up front,
then agile iterations for build & test).

---

## Overview

This roadmap breaks the project into SDLC phases with clear entry criteria, deliverables,
and exit criteria ("Definition of Done"). Timeboxes are indicative for a small team/solo
developer and can be compressed or expanded.

```
Phase 0  Planning & Requirements     ← YOU ARE HERE
Phase 1  Design & Architecture
Phase 2  Core Authentication (MVP)
Phase 3  Authorization / RBAC
Phase 4  Security Hardening
Phase 5  Testing & QA
Phase 6  Documentation & Developer Experience
Phase 7  Packaging, CI/CD & Release
Phase 8  Maintenance & Iteration
```

---

## Phase 0 — Planning & Requirements  ✅ (in progress)
**Goal:** Agree on *what* we're building and *why*, before any code.

- Deliverables:
  - [x] Project vision / README
  - [x] Software Requirements Specification ([SRS-Requirements.md](SRS-Requirements.md))
  - [x] This roadmap
  - [ ] Success metrics agreed (adoption, security posture, DX time-to-integrate)
- Exit criteria: Requirements reviewed and accepted; scope for v1 frozen.
- Est. effort: **1–2 days**

---

## Phase 1 — Design & Architecture  🟡 (drafted — pending review)
**Goal:** Decide *how*. Turn requirements into a concrete technical plan.

- Key decisions made here (deferred from Phase 0) — see [ADRs](design/00-Decisions-ADR.md):
  - [x] Technology stack → **Node.js + TypeScript** (ADR-001)
  - [x] Deliverable form → **standalone service + modular core** (ADR-002)
  - [x] Auth mechanism → **JWT access + rotating refresh** (ADR-003)
  - [x] Database engine → **PostgreSQL** (ADR-004)
- Deliverables:
  - [x] [Architecture document](design/01-Architecture.md) (components, data flow, deployment)
  - [x] [Database schema](design/02-Database-Schema.md) (users, roles, permissions, sessions, audit)
  - [x] [API contract](design/03-API-Contract.md) (endpoints, request/response, error model)
  - [x] [**Threat model** (STRIDE)](design/04-Threat-Model.md) + security design decisions
  - [x] [Engineering standards](design/05-Engineering-Standards.md) (coding, branching, license)
- Exit criteria: Architecture + API contract + threat model reviewed and approved. ⟵ **awaiting your review**
- Est. effort: **3–5 days**

---

## Phase 2 — Core Authentication (MVP)  ✅ (implemented)
**Goal:** A working, secure authentication core.

- Scope (maps to FR-1..FR-17, SEC-1/2/7/12):
  - [x] Registration + input validation (JSON-Schema at the API boundary + password policy)
  - [x] Secure password hashing (Argon2id via `@node-rs/argon2`)
  - [x] Login / logout
  - [x] Token issuance + stateless verification + rotating refresh (with reuse detection)
  - [x] Password change & reset (single-use, time-limited tokens; sessions invalidated)
  - [x] Email verification
- Also delivered: config validation, storage abstraction (in-memory + PostgreSQL +
  migration), rate limiting, audit hooks, health/ready endpoints, **38 passing tests**,
  clean typecheck, and **0 production-dependency vulnerabilities** (Fastify 5).
- Exit criteria: A user can register, log in, refresh, and reset password securely;
  tests pass. ✅ **Met.**
- Est. effort: **1–2 weeks**

> Note: RBAC *enforcement* (guards, admin endpoints, role management) is Phase 3. Phase 2
> already resolves and embeds roles/permissions in tokens, and ships the full RBAC schema.

---

## Phase 3 — Authorization / RBAC  ✅ (implemented)
**Goal:** Roles and permissions enforced across protected operations.

- Scope (maps to FR-18..FR-29):
  - [x] Roles, Permissions, and mappings implemented
  - [x] Effective-permission resolution (union across roles)
  - [x] Deny-by-default enforcement / guard mechanism (`requirePermission`)
  - [x] Default roles (`user`, `admin`) + custom roles
  - [x] Admin operations (manage users, roles, permissions, role assignment)
  - [ ] (Optional) role hierarchy / inheritance — deferred (schema supports it)
- Also delivered: `grant-admin` CLI to bootstrap the first administrator; disabling a
  user revokes their sessions; all admin mutations write to the audit log; **60 tests
  passing** (22 new: RBAC service + admin API guard enforcement).
- Exit criteria: Protected actions require the correct permission; admin can manage RBAC;
  tests pass. ✅ **Met.**
- Est. effort: **1–2 weeks**

> Deferred: role hierarchy/inheritance (FR-24, "SHOULD") and instant permission
> invalidation via `permVer` (currently changes apply on next token refresh within the
> access-token TTL). Both are candidates for Phase 4.

---

## Phase 4 — Security Hardening  ✅ (implemented)
**Goal:** Close the gap between "works" and "safe to trust."

- Scope (maps to §5 Security Requirements):
  - [x] Rate limiting + **account lockout** (per-identifier, auto-unlocking) (SEC-3)
  - [x] Token revocation + refresh rotation with reuse detection (SEC-4, from Phase 2)
  - [x] **CSRF protection** for cookie flows (Origin check + `SameSite=Strict`) (SEC-6)
  - [x] Secrets management & **signing-key rotation** (verify current + previous) (SEC-8)
  - [x] Audit logging of security events (SEC-10)
  - [x] Dependency/CVE scanning in **CI** (SEC-11)
  - [x] **Security headers** via `@fastify/helmet` (HSTS, nosniff, frame-options)
  - [ ] (Optional) MFA/TOTP — deferred
- Also delivered: `SECURITY.md` disclosure policy; GitHub Actions CI (typecheck, lint,
  test, `npm audit`); **68 tests passing**; **0 production-dependency vulnerabilities**.
- Exit criteria: Threat-model mitigations implemented; security checklist passes. ✅ **Met.**
- Est. effort: **1–2 weeks**

> Deferred: MFA/TOTP (optional, FR-11) and instant permission invalidation via `permVer`
> (access tokens remain valid ≤ TTL by design). Both are candidates for a later iteration.

---

## Phase 5 — Testing & QA  ✅ (complete)
**Goal:** Prove it works and stays working.

- Scope:
  - [x] Unit tests (core auth + RBAC logic) — **~98% line / ~93% branch** (target was ≥ 80%)
  - [x] Integration tests (end-to-end HTTP flows via Fastify `inject`)
  - [x] Security testing (authz bypass, brute force/lockout, token reuse, injection-as-literal)
  - [x] Negative & edge cases (malformed input, expired email/reset/refresh/access tokens, enumeration)
  - [ ] Load/performance sanity against NFR targets — deferred (needs a perf harness)
- Also delivered: coverage measurement (`@vitest/coverage-v8`) with a **threshold gate**
  (≥90% lines / ≥88% branches) wired into CI; **119 tests** across 12 files.
- Exit criteria: All test suites green; coverage target met; known-issue list triaged.
  ✅ **Met.**
- Est. effort: **1–2 weeks** (runs partly in parallel with Phases 2–4)

> Deferred: load/performance testing (NFR-4/5) — best done with a dedicated harness (e.g.
> autocannon/k6) against a Postgres-backed deployment; slotted for later.

---

## Phase 6 — Documentation & Developer Experience  ✅ (complete)
**Goal:** Someone else can adopt it in under 30 minutes (NFR-9).

- Scope:
  - [x] Quick-start / getting-started guide (README)
  - [x] API reference — **generated OpenAPI spec + Swagger UI** (`/api/v1/openapi.json`, `/docs`)
  - [x] Integration example ([guides/Integration.md](guides/Integration.md))
  - [x] Configuration & deployment guide ([guides/Deployment.md](guides/Deployment.md))
  - [x] Security & operations notes (deployment guide + `SECURITY.md`)
  - [x] CONTRIBUTING + Code of Conduct + SECURITY.md
- Exit criteria: A fresh developer integrates the system using only the docs. ✅ **Met.**
- Est. effort: **3–5 days**

---

## Phase 7 — Packaging, CI/CD & Release  🟡 (automation ready; release is a manual step)
**Goal:** Make it free and easy to obtain and run.

- Scope:
  - [x] License file (MIT)
  - [x] Container image (Dockerfile + .dockerignore)
  - [x] CI pipeline (typecheck, lint, coverage, security audit) + CD release workflow
  - [x] Versioning (SemVer) + changelog (CHANGELOG.md)
  - [ ] **Public v1.0.0 release** — owner cuts the tag (`git push origin v1.0.0`) after a
    one-time GitHub "read & write" Actions permission toggle
- Exit criteria: A tagged, documented, installable v1.0.0 is publicly available.
  ⟵ **awaiting the owner to cut the release**
- Est. effort: **3–5 days**

> A compiled/bundled slim container (vs. running via `tsx` with dev deps) and SBOM
> generation are future optimizations.

---

## Phase 8 — Maintenance & Iteration
**Goal:** Keep it secure and useful over time.

- Ongoing:
  - Security patching & dependency updates
  - Bug triage & issue response
  - Feature iterations from the backlog (MFA, social login, resource-scoped perms)
  - Periodic threat-model review

---

## Milestone summary

| Milestone | Phase | Definition |
|-----------|-------|------------|
| **M0** Requirements frozen | 0 | SRS accepted |
| **M1** Design approved | 1 | Architecture + API + threat model signed off |
| **M2** Auth MVP | 2 | Register/login/reset working & tested |
| **M3** RBAC complete | 3 | Roles/permissions enforced |
| **M4** Hardened | 4 | Security mitigations in place |
| **M5** QA passed | 5 | Coverage + security tests green |
| **M6** Docs ready | 6 | 30-min integration achievable |
| **M7** v1.0.0 released | 7 | Public, free, installable |

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Rolling own crypto / auth incorrectly | High (breaches) | Use vetted libraries; follow OWASP; threat model; peer review |
| Scope creep (MFA, social, SAML in v1) | Medium (delay) | Keep v1 lean; push extras to backlog/Phase 8 |
| Insecure defaults adopted by users | High | Ship secure-by-default config; document safe deployment |
| Low test coverage on security paths | High | Enforce coverage gate; dedicated security test suite |
| Dependency vulnerabilities | Medium | Automated CVE scanning in CI (SEC-11) |

---

## Immediate next steps

1. Review & accept the [SRS](SRS-Requirements.md) (freeze v1 scope) → **M0**.
2. Kick off **Phase 1**: make the four deferred decisions (stack, deliverable, auth mechanism, database).
3. Produce the architecture doc, DB schema, API contract, and threat model.
