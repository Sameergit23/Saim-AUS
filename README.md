# Saim-AUS — Authentication & Authorization System

A **free, open-source, secure** authentication system with **Role-Based Access Control (RBAC)**
that any developer can drop into their project.

> Status: **Phase 1 — Design & Architecture (drafted, pending review)**
> This repository currently contains SDLC planning & design documents only. No code yet.

## Vision

Most projects re-invent login, password handling, and permissions — often insecurely.
Saim-AUS aims to be a reusable, well-tested, security-first building block that handles:

- User registration, login, logout
- Secure password storage and reset
- Session / token management
- **Role-based authorization** (users → roles → permissions)
- Account protection (rate limiting, lockout, optional MFA)
- Audit logging

Free to use under the [MIT License](LICENSE) — use it in any project, including commercial.

## Documents

| Document | Purpose |
|----------|---------|
| [docs/SRS-Requirements.md](docs/SRS-Requirements.md) | Software Requirements Specification — what the system must do |
| [docs/Roadmap.md](docs/Roadmap.md) | SDLC roadmap — phases, milestones, and deliverables |
| [docs/design/00-Decisions-ADR.md](docs/design/00-Decisions-ADR.md) | Architecture Decision Records — the stack/auth/DB choices |
| [docs/design/01-Architecture.md](docs/design/01-Architecture.md) | Architecture — components, layers, runtime flows, deployment |
| [docs/design/02-Database-Schema.md](docs/design/02-Database-Schema.md) | Database schema — tables, DDL, RBAC model, seed data |
| [docs/design/03-API-Contract.md](docs/design/03-API-Contract.md) | REST/JSON API contract — endpoints, errors, token claims |
| [docs/design/04-Threat-Model.md](docs/design/04-Threat-Model.md) | STRIDE threat model + security mitigations checklist |
| [docs/design/05-Engineering-Standards.md](docs/design/05-Engineering-Standards.md) | Coding, testing, branching, and CI standards |

## Key decisions (made in Phase 1 — see ADRs)

| Decision | Choice |
|----------|--------|
| Language / runtime | Node.js + TypeScript |
| Deliverable form | Standalone self-hostable service + modular core |
| Auth mechanism | JWT access tokens + rotating refresh tokens |
| Database | PostgreSQL (with storage abstraction) |
| Password hashing | Argon2id |
| License | MIT |

All are recorded as reversible ADRs — see [docs/design/00-Decisions-ADR.md](docs/design/00-Decisions-ADR.md).
