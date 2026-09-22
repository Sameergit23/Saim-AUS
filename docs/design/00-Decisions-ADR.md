# Architecture Decision Records (ADR)
## Saim-AUS — Phase 1 Design

**Version:** 0.1 (Draft)
**Date:** 2026-09-22
**Status:** Proposed — pending owner acceptance

> These records resolve the four decisions deferred from Phase 0, plus supporting choices.
> Each is **reversible**; if you prefer a different option, we update the record and the
> dependent design docs. Nothing here is locked into code yet.

Format per record: **Context → Decision → Consequences → Alternatives considered.**

---

### ADR-001 — Language & Runtime: **Node.js + TypeScript**
- **Context:** Needs broad adoptability (so others can use it freely), strong typing for a
  security-critical codebase, and a large library ecosystem for vetted crypto/auth primitives.
- **Decision:** Build in **TypeScript on Node.js (LTS)**.
- **Consequences:** Type safety on auth logic; huge ecosystem; easy self-hosting; most
  developers can read/extend it. Requires a build step and disciplined dependency hygiene.
- **Alternatives:** Python/FastAPI (great DX, chosen against for ecosystem breadth here),
  Java/Spring (heavier), Go (fast but more manual). All viable; TS chosen for reach + typing.

---

### ADR-002 — Deliverable Form: **Standalone self-hostable service, with a modular core**
- **Context:** Goal is "drop into any project." A service is language-agnostic to *consumers*
  (any app can call its API), maximizing reuse.
- **Decision:** Ship a **standalone auth service** exposing a versioned **REST/JSON API**.
  Keep the domain/auth logic in a **framework-agnostic core module** so it can later also be
  published as a library.
- **Consequences:** Clean isolation (apps never handle raw passwords). One deployment unit.
  Slight network hop per verification — mitigated by stateless token verification.
- **Alternatives:** Library/SDK (tighter coupling, per-language ports needed),
  full-stack template (least reusable). Service chosen for maximum reach.

---

### ADR-003 — Auth Mechanism: **JWT access tokens + rotating refresh tokens (hybrid)**
- **Context:** Want stateless, fast verification *and* the ability to revoke.
- **Decision:**
  - **Access token:** short-lived (e.g., 15 min) signed JWT — stateless verification.
  - **Refresh token:** long-lived, **stored server-side, single-use, rotated** on each use,
    revocable. Delivered via HttpOnly Secure cookie (web) or secure storage (mobile).
- **Consequences:** Fast authz checks with no DB hit on the hot path; revocation still possible
  via the refresh store; token theft window bounded. More moving parts than pure sessions.
- **Alternatives:** Pure server-side sessions (easy revoke, DB hit per request),
  pure stateless JWT (can't revoke). Hybrid gives the best of both.

---

### ADR-004 — Database: **PostgreSQL** (with a storage abstraction)
- **Context:** RBAC is inherently relational (users↔roles↔permissions) and benefits from real
  constraints and transactions. Must be free and widely hosted.
- **Decision:** Use **PostgreSQL** as the primary store, behind a **repository/storage
  interface** so an alternate engine (e.g., SQLite for local dev) can be swapped.
- **Consequences:** Strong integrity for RBAC, mature tooling, free. Abstraction adds a thin
  layer but preserves portability and testability.
- **Alternatives:** MongoDB (weaker relational integrity for RBAC), SQLite-only (fine for dev,
  not for scale). Postgres chosen; SQLite supported for local dev via the abstraction.

---

### ADR-005 — Password Hashing: **Argon2id**
- **Context:** Password storage is the highest-value target.
- **Decision:** Hash with **Argon2id** (tuned memory/time cost), unique per-user salt.
  Fall back to **bcrypt** only where Argon2 is unavailable.
- **Consequences:** Strong resistance to GPU/ASIC cracking. Cost parameters must be tuned per
  deployment hardware and revisited over time.
- **Alternatives:** bcrypt (good, older), scrypt, PBKDF2 (weaker). Argon2id is current best practice.

---

### ADR-006 — HTTP Framework (reference): **Fastify**
- **Context:** Need performance and, importantly, **schema-based request validation** for security.
- **Decision:** Use **Fastify** with JSON Schema validation as the reference HTTP layer.
  The HTTP layer is kept thin so the auth core stays framework-agnostic.
- **Consequences:** Built-in validation reduces injection/malformed-input risk; good performance.
- **Alternatives:** Express (more ubiquitous, less built-in validation). Either works; Fastify
  chosen for validation-by-default.

---

### ADR-007 — License: **MIT** (default) — Apache-2.0 as alternative
- **Context:** Must be free for anyone to use in their projects.
- **Decision:** Release under **MIT** for maximum permissiveness and simplicity.
- **Consequences:** Anyone can use/modify/distribute, including commercially. No patent grant
  (Apache-2.0 adds one — switch if patent protection is desired).
- **Alternatives:** Apache-2.0 (patent grant, slightly more formal). Decision easily changed
  before v1.0.0.

---

### ADR-008 — Versioning & Branching: **SemVer + trunk-based + Conventional Commits**
- **Context:** A security library needs predictable releases and clear change history.
- **Decision:** **Semantic Versioning** for releases; **trunk-based development** with
  short-lived feature branches and PR review; **Conventional Commits** to drive changelogs.
- **Consequences:** Clear upgrade signals (esp. security patches), automated changelog,
  low merge overhead. Requires CI gates on every PR.
- **Alternatives:** GitFlow (heavier). Trunk-based fits a small, fast-moving team.

---

## Decision summary

| ADR | Topic | Decision |
|-----|-------|----------|
| 001 | Language/runtime | Node.js + TypeScript |
| 002 | Deliverable | Standalone service + modular core |
| 003 | Auth mechanism | JWT access + rotating refresh |
| 004 | Database | PostgreSQL (+ storage abstraction) |
| 005 | Password hashing | Argon2id |
| 006 | HTTP framework | Fastify (reference) |
| 007 | License | MIT |
| 008 | Versioning/branching | SemVer + trunk-based + Conventional Commits |

**To change any decision:** say which ADR and your preferred option; dependent docs
(architecture, schema, API) will be updated to match.
