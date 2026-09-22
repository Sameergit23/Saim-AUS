# Software Requirements Specification (SRS)
## Saim-AUS — Authentication & Authorization System

**Version:** 0.1 (Draft)
**Date:** 2026-09-22
**Status:** Phase 0 — Requirements
**License intent:** Permissive open source (MIT or Apache-2.0) — free for any project

---

## 1. Introduction

### 1.1 Purpose
This document defines the requirements for **Saim-AUS**, a secure, reusable authentication
and authorization system with role-based access control (RBAC). It is the reference for
design, implementation, and testing in later SDLC phases.

### 1.2 Scope
Saim-AUS provides identity (who you are — *authentication*) and access control
(what you may do — *authorization*). It is intended to be integrated by other developers
into their own applications, free of charge.

**In scope:** registration, login/logout, password lifecycle, session/token management,
RBAC (roles & permissions), account protection, audit logging, admin management, integration API.

**Out of scope (v1):** billing/subscriptions, full identity-provider federation (SAML),
social login is *optional/stretch*, user-facing UI beyond minimal reference examples.

### 1.3 Definitions & Acronyms
| Term | Meaning |
|------|---------|
| **AuthN** | Authentication — verifying identity |
| **AuthZ** | Authorization — verifying permission |
| **RBAC** | Role-Based Access Control — permissions granted via roles |
| **JWT** | JSON Web Token — signed, self-contained token |
| **MFA / 2FA** | Multi/Two-Factor Authentication |
| **PII** | Personally Identifiable Information |
| **Principal** | The authenticated actor (a user) |
| **Permission** | A single grantable capability (e.g., `post:delete`) |
| **Role** | A named bundle of permissions (e.g., `admin`) |

### 1.4 Stakeholders
- **Integrating developers** — the primary users; embed Saim-AUS in their apps.
- **End users** — accounts managed by the system (register, log in).
- **Administrators** — manage users, roles, and permissions.
- **Maintainers** — the project team building and securing Saim-AUS.

---

## 2. Overall Description

### 2.1 Product perspective
A standalone, self-hostable component. It exposes a clean integration surface (API and/or
library) so an application never handles raw passwords or permission logic itself.

### 2.2 User classes
1. **Anonymous** — can register and log in only.
2. **Authenticated user** — has an identity and assigned roles.
3. **Admin** — elevated role that manages users/roles/permissions.

### 2.3 Operating assumptions & constraints
- All traffic runs over **TLS/HTTPS**. Plaintext transport is never supported.
- The host application is responsible for its own transport termination and secrets storage.
- Must be runnable free of licensing cost on commodity hosting.
- Config via environment variables / config file — no secrets hard-coded.

---

## 3. Functional Requirements

Each requirement has a stable ID (`FR-x`). "MUST" = required for v1, "SHOULD" = strong
recommendation, "MAY" = optional/stretch.

### 3.1 Account lifecycle
- **FR-1 (MUST)** Register a new account with a unique identifier (email/username) + password.
- **FR-2 (MUST)** Validate input on registration (format, password strength policy).
- **FR-3 (MUST)** Reject duplicate accounts.
- **FR-4 (SHOULD)** Verify email ownership via a one-time verification link/token before activation.
- **FR-5 (MUST)** Deactivate / disable an account (admin action, and self-service where allowed).
- **FR-6 (MAY)** Permanent account deletion honoring data-privacy rules.

### 3.2 Authentication
- **FR-7 (MUST)** Log in with credentials and receive a valid session or token.
- **FR-8 (MUST)** Log out and invalidate the active session/token.
- **FR-9 (MUST)** Reject invalid credentials with a generic, non-enumerating error message.
- **FR-10 (SHOULD)** Support token/session refresh without re-entering credentials.
- **FR-11 (MAY)** Support MFA/2FA (TOTP authenticator app) as an opt-in second factor.
- **FR-12 (MAY)** Support social / OAuth login (Google, GitHub) as a stretch goal.

### 3.3 Password management
- **FR-13 (MUST)** Store passwords only as salted hashes using a modern algorithm (Argon2id or bcrypt). Never store or log plaintext.
- **FR-14 (MUST)** Enforce a configurable password policy (min length, complexity/among-breached checks).
- **FR-15 (MUST)** Allow an authenticated user to change their password (requires current password).
- **FR-16 (MUST)** Provide "forgot password" reset via a time-limited, single-use token sent out of band (email).
- **FR-17 (SHOULD)** Invalidate existing sessions on password change/reset.

### 3.4 Authorization / RBAC
- **FR-18 (MUST)** Model **Users**, **Roles**, and **Permissions** as first-class entities.
- **FR-19 (MUST)** Assign one or more roles to a user.
- **FR-20 (MUST)** Assign one or more permissions to a role.
- **FR-21 (MUST)** Resolve a user's effective permissions as the union of their roles' permissions.
- **FR-22 (MUST)** Enforce access on protected operations by required permission (deny by default).
- **FR-23 (MUST)** Ship sensible default roles (e.g., `user`, `admin`) and allow custom roles.
- **FR-24 (SHOULD)** Support role hierarchy / inheritance (e.g., `admin` inherits `user`).
- **FR-25 (MAY)** Support fine-grained/resource-scoped permissions (e.g., ownership checks).

### 3.5 Administration
- **FR-26 (MUST)** Admins can list, view, enable/disable users.
- **FR-27 (MUST)** Admins can create/edit/delete roles and permissions.
- **FR-28 (MUST)** Admins can assign/revoke roles for a user.
- **FR-29 (SHOULD)** All privileged admin actions are recorded in the audit log.

### 3.6 Auditing & observability
- **FR-30 (MUST)** Log security-relevant events: login success/failure, logout, password reset, role changes, lockouts.
- **FR-31 (SHOULD)** Expose health/readiness endpoints for operations.
- **FR-32 (SHOULD)** Emit metrics (auth attempts, failures, active sessions).

### 3.7 Integration surface
- **FR-33 (MUST)** Provide a documented, versioned integration API (endpoints and/or library functions).
- **FR-34 (MUST)** Provide a way for a protected app to verify a token/session and read the caller's identity + permissions.
- **FR-35 (SHOULD)** Provide a quick-start example integration for at least one client type.

---

## 4. Non-Functional Requirements (NFRs)

### 4.1 Security (highest priority — see also §5)
- **NFR-1** Follow OWASP ASVS / Top 10 guidance throughout.
- **NFR-2** Secure defaults: deny-by-default authorization, secure cookie flags, least privilege.
- **NFR-3** No secret, password, or token value ever written to logs.

### 4.2 Performance
- **NFR-4** Auth verification (token/session check) target < 50 ms server-side under normal load.
- **NFR-5** Login (including password hashing) target < 500 ms.

### 4.3 Scalability & reliability
- **NFR-6** Stateless verification path where possible, to scale horizontally.
- **NFR-7** No single-user action can exhaust resources (bounded work per request).
- **NFR-8** Graceful degradation and clear error handling; no crashes on malformed input.

### 4.4 Usability / Developer Experience (DX)
- **NFR-9** Integration should take a new developer < 30 minutes following the quick-start.
- **NFR-10** Clear, complete documentation and runnable examples.
- **NFR-11** Meaningful, non-leaky error messages.

### 4.5 Maintainability & portability
- **NFR-12** Modular architecture with clear separation (AuthN, AuthZ, storage, transport).
- **NFR-13** Automated test coverage target ≥ 80% on core auth logic.
- **NFR-14** Configuration via environment; runnable on common OSes and container runtimes.

### 4.6 Compliance & licensing
- **NFR-15** Released under a permissive OSS license (MIT or Apache-2.0) — free for any use.
- **NFR-16** Support basic data-privacy needs (data export/delete for a user; minimal PII).

---

## 5. Security Requirements (dedicated)

Because this is a security product, these are called out explicitly.

| ID | Requirement |
|----|-------------|
| **SEC-1** | Passwords hashed with **Argon2id** (preferred) or **bcrypt**, unique per-user salt, tuned work factor. |
| **SEC-2** | All transport over **TLS 1.2+**; secure/HttpOnly/SameSite flags on cookies. |
| **SEC-3** | **Brute-force protection**: rate limiting + progressive delay + account lockout with safe unlock. |
| **SEC-4** | **Token security**: short-lived access tokens, rotating single-use refresh tokens, signed with strong keys, revocation supported. |
| **SEC-5** | **Input validation & output encoding** everywhere; protect against SQL injection, XSS, and injection. |
| **SEC-6** | **CSRF protection** for cookie-based flows. |
| **SEC-7** | **No user enumeration** — login/reset responses don't reveal whether an account exists. |
| **SEC-8** | **Secrets management** — keys/secrets from environment/secret store, never in source control. |
| **SEC-9** | **Least privilege & deny-by-default** authorization on every protected action. |
| **SEC-10** | **Audit trail** for authentication and authorization events (see FR-30). |
| **SEC-11** | Dependency & supply-chain scanning in CI; timely patching of known CVEs. |
| **SEC-12** | Reset/verification tokens are single-use, time-limited, and cryptographically random. |

---

## 6. Data Model (conceptual — RBAC core)

```
User (id, identifier, password_hash, status, created_at, ...)
Role (id, name, description)
Permission (id, name, description)          e.g. "post:create", "user:manage"
UserRole (user_id, role_id)                 many-to-many
RolePermission (role_id, permission_id)     many-to-many
AuditLog (id, actor_id, event, target, timestamp, metadata)
Session/Token (id, user_id, issued_at, expires_at, revoked, ...)
```

Effective permissions of a user = union of permissions across all assigned roles.

---

## 7. Acceptance criteria (samples)

- A user cannot access a permission-protected action without a role granting it (deny-by-default).
- Passwords are never retrievable in plaintext from storage or logs.
- A brute-force sequence triggers rate limiting/lockout as configured.
- A password reset link works once and expires; old sessions are invalidated.
- Wrong password and unknown account return an indistinguishable error.

---

## 8. Traceability

Each requirement ID (FR-x / NFR-x / SEC-x) will be traced forward to design elements,
code modules, and test cases in later phases (see Roadmap).
