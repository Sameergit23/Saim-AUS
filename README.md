# Saim-AUS — Authentication & Authorization System

A **free, open-source, secure** authentication system with **Role-Based Access Control (RBAC)**
that any developer can drop into their project.

> Status: **Phase 2 — Auth MVP implemented** ✅
> Working TypeScript service: register, verify, login, refresh (rotating), logout,
> password change/reset, and `/me`. 38 tests passing. RBAC enforcement lands in Phase 3.

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

## Getting started (development)

Requires **Node.js 20+**.

```bash
npm install
cp .env.example .env          # then set a strong JWT_SECRET (>= 32 chars)
npm run dev                   # starts the service (default: http://localhost:3000)
```

By default the service runs with the in-memory store (`STORAGE=memory`) — no database
needed for local development. For PostgreSQL, set `STORAGE=postgres` and `DATABASE_URL`,
then apply the schema:

```bash
npm run migrate
```

### Common scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start with hot reload |
| `npm start` | Start once |
| `npm test` | Run the test suite (38 tests) |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run lint` / `npm run format` | Lint / format |
| `npm run migrate` | Apply the PostgreSQL schema |

### Try it (curl)

```bash
# 1. Register (a verification link is logged to the console in dev)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Str0ng!Passphrase"}'

# 2. Verify with the token from the console, then log in
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Str0ng!Passphrase"}'

# 3. Call a protected route with the returned access token
curl http://localhost:3000/api/v1/me -H 'Authorization: Bearer <accessToken>'
```

See the full endpoint reference in [docs/design/03-API-Contract.md](docs/design/03-API-Contract.md).

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
