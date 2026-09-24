# Development Guide — Saim-AUS

A practical guide to make any developer productive in this repo **immediately after cloning**.
For the full narrative of how the project was built, see
[docs/THE-MAKING-OF-SAIM-AUS.md](docs/THE-MAKING-OF-SAIM-AUS.md).

---

## What this project is

**Saim-AUS** is a free, self-hostable **authentication & authorization service** (a REST/JSON
API) with **RBAC** (roles & permissions) and **MFA/TOTP**. It is **headless** — a backend other
apps call; there is intentionally **no frontend**. Stack: **Node.js + TypeScript + Fastify +
PostgreSQL**. License: MIT. Runs via **`tsx`** (TypeScript executed directly — **no build step**).

## Quick start (after cloning)

Requires **Node.js 20+**.

```bash
npm install
# set a signing secret (>= 32 chars); dev uses the in-memory store, no DB needed
#   PowerShell: $env:JWT_SECRET = node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
npm run dev            # start with hot reload (http://localhost:3000)
# open http://localhost:3000/docs  → interactive Swagger UI (dev only)
```

| Command | Purpose |
|---------|---------|
| `npm run dev` / `npm start` | Run with hot reload / once |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm test` / `npm run test:coverage` | Vitest (138 tests) / with coverage gate |
| `npm run migrate` | Apply PostgreSQL migrations (needs `DATABASE_URL`) |
| `npm run start:prod` | `migrate && start` (used in Docker/Render) |
| `npm run grant-admin -- <email>` | Promote a user to admin (needs Postgres) |

**Before committing, all of these must pass:** `npm run typecheck && npm run lint && npm run test:coverage`.

## Architecture — layers (dependencies point inward)

```
src/api/      HTTP layer: Fastify routes, guards, schemas, error handler. THIN — no business logic.
src/core/     Business logic, framework-agnostic: authn, authz, mfa, password, tokens, domain.
src/storage/  Persistence behind interfaces: memory (dev/tests) + postgres (prod).
src/infra/    Adapters: config, clock, crypto, encryption, mailer, smtpMailer, duration.
src/index.ts  Composition root — wires everything and starts the server.
```

**Hard rule:** `src/core` must **not** import Fastify or `pg`. Storage & infra are injected in.
This is what keeps the core testable and portable.

## Directory map (key files)

- **API** — `src/api/server.ts` (builds the Fastify app; registers swagger, helmet, cookie,
  rate-limit, routes; note: **no CORS yet** — add it for browser frontends on other origins),
  `authGuard.ts` (`createAuthenticate`, `createRequirePermission`, `bearerSecurity`),
  `csrfGuard.ts`, `cookies.ts`, `errorHandler.ts`, `schemas.ts` (TypeBox request schemas),
  `routes/{auth,me,admin,health}.ts`.
- **Core** — `core/authn/authService.ts` (register, verify, login, refresh, logout, password reset/change, `completeMfaLogin`),
  `core/authz/rbacService.ts` (admin user/role/permission ops), `core/mfa/mfaService.ts` (TOTP enroll/confirm/verify/disable),
  `core/password/passwordService.ts` (Argon2id), `core/tokens/tokenService.ts` (JWT access + MFA challenge tokens),
  `core/domain/{types,errors}.ts`.
- **Storage** — `storage/interfaces.ts` (repo contracts), `storage/index.ts` (factory),
  `storage/memory/memoryStorage.ts`, `storage/postgres/{postgresStorage,pool,migrate}.ts`,
  `storage/postgres/migrations/*.sql`.
- **Infra** — `infra/clock.ts` (`systemClock`, `fixedClock`), `infra/crypto.ts` (token hashing),
  `infra/encryption.ts` (AES-256-GCM for the TOTP secret), `infra/mailer.ts` (console mailer),
  `infra/smtpMailer.ts` (nodemailer), `infra/duration.ts`.
- **Config** — `src/config/index.ts` (`loadConfig()` validates env, fails fast).
- **CLI** — `src/cli/grantAdmin.ts`.
- **Tests** — `test/*.test.ts` + `test/helpers.ts` (the test harness).

## Conventions

- **TypeScript strict**, **ESM**, run via `tsx` (no compile). Match surrounding style.
- **Validate all input** at the API boundary using TypeBox schemas in `src/api/schemas.ts`.
- **Never hand-roll crypto** — use `@node-rs/argon2`, `jose`, `otpauth`.
- **Deny-by-default** authorization; **generic auth errors** (never reveal whether an account exists).
- **Errors:** throw `AppError` (`src/core/domain/errors.ts` — see the `Errors` factory); the API's
  `errorHandler.ts` maps them to the standard envelope `{ error: { code, message, requestId } }`.
- **Never log secrets/passwords/tokens.** Tokens are stored only as hashes.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `security:`). Trunk-based:
  branch off `main`, open a PR. CI (`.github/workflows/ci.yml`) must be green.

## Recipes (how to add things)

- **New endpoint:** add a TypeBox schema in `api/schemas.ts` → add the route in the right
  `api/routes/*.ts` → if it's a new group, register it in `api/server.ts`. **Protected route?**
  add `preHandler: deps.authenticate` (and `createRequirePermission(perm)` for admin) **and**
  `schema: { security: bearerSecurity }` so Swagger's Authorize attaches the token.
- **New user/db field:** update `core/domain/types.ts` → `storage/interfaces.ts` (e.g. `UserPatch`)
  → both `memory` and `postgres` impls → add a numbered migration in
  `storage/postgres/migrations/` (idempotent SQL) → add the field to the test harness config if needed.
- **New config/env var:** add to the `Config` interface **and** `loadConfig()` in `src/config/index.ts`
  → add to `test/helpers.ts` config object → document in `.env.example`.
- **Time-dependent logic in tests:** inject a `fixedClock` (see `test/edgeCases.test.ts`).

## Environment variables (see `.env.example`)

Required: `JWT_SECRET` (≥32 chars). Storage: `STORAGE` (`memory`|`postgres`), `DATABASE_URL`.
Common: `PORT`, `NODE_ENV`, `COOKIE_SECURE`, `ALLOWED_ORIGINS` (CSRF), `PUBLIC_BASE_URL`,
`ENABLE_DOCS_UI`. Security: `JWT_PREVIOUS_SECRET` (key rotation), `LOGIN_MAX_ATTEMPTS`,
`LOGIN_LOCKOUT_MINUTES`, `MFA_SECRET_KEY`. Email: `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`.

## Testing

- **Vitest**, 138 tests. **Coverage gate** in `vitest.config.ts`: ≥90% lines/functions/statements,
  ≥88% branches, on `src/core`, `src/api`, `src/config`, `src/infra`, `src/storage/memory`.
- Tests use the **in-memory store** and a harness: `buildTestHarness()` in `test/helpers.ts`
  returns `{ auth, rbac, mfa, tokens, storage, config, sent, clock }`. For HTTP tests, `buildServer(...)`
  then `app.inject(...)`. `loginOk(...)` logs in and asserts no MFA challenge.
- **CI won't pass if coverage drops or a production dependency has a known vulnerability.**

## Deployment

- **Docker** (`Dockerfile`, runs via `tsx`; installs devDeps with `--include=dev` so tsx exists).
- **Render**: `render.yaml` blueprint provisions the app + a managed Postgres, generates secrets,
  runs `npm run start:prod` (migrate → start). Push to `main` → auto-deploy.
- First admin: `npm run grant-admin -- you@example.com` (in the container shell / with Postgres).
- Guide: [docs/guides/Deployment.md](docs/guides/Deployment.md).

## Current state & backlog

- **Done:** SDLC Phases 0–7 + MFA/TOTP + SMTP email + live deploy. v1.0.0.
- **Deferred / good next tasks:** **CORS** (needed for browser frontends on other origins —
  not yet added), instant permission invalidation via `permVer`, load/perf testing, a compiled
  slim container image, SBOM generation, an `/auth/introspect` endpoint.

## Gotchas (read before you're surprised)

- **No frontend** — headless API by design. Test via `/docs` (dev) or curl/HTTP.
- **No build step** — `tsx` runs TS directly. Any Docker image must install devDeps for `tsx`.
- **Render mangles quoted shell commands** — start via `npm run start:prod`, not `sh -c "..."`.
- **`/docs` UI is off in production** (`ENABLE_DOCS_UI` defaults false when `NODE_ENV=production`).
- **No SMTP configured → emails only log to console** (links appear in server logs).
- **Windows LF/CRLF git warnings are harmless.**
- **`grant-admin` needs Postgres** — pointless against the in-memory store (separate process).

## Deeper documentation

- 📖 **[docs/THE-MAKING-OF-SAIM-AUS.md](docs/THE-MAKING-OF-SAIM-AUS.md)** — full plain-English guide.
- `docs/design/` — decisions (ADRs), architecture, DB schema, API contract, threat model, standards.
- `docs/Roadmap.md`, `docs/SRS-Requirements.md`, `docs/guides/{Integration,Deployment}.md`.
