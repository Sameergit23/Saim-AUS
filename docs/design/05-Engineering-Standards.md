# Engineering Standards
## Saim-AUS — Phase 1 Design

**Version:** 0.1 (Draft) · **Date:** 2026-09-22

> Conventions for building Saim-AUS consistently and safely. Keeps the codebase reviewable,
> testable, and secure by default.

---

## 1. Language & style
- **TypeScript**, `strict` mode on; no implicit `any`.
- Lint/format: **ESLint + Prettier**, enforced in CI (fail on error).
- Prefer pure functions in the core; side effects live in adapters (infra/storage).
- No secrets, credentials, or tokens in code, comments, tests, or logs.

## 2. Project structure
Follow the module layout in [01-Architecture.md](01-Architecture.md) §7. Dependency rule:
`api → core → domain`; storage/infra injected at the composition root. The core must not
import framework or DB packages.

## 3. Security coding rules (non-negotiable)
- Parameterized queries only — never string-concatenate SQL.
- Validate every external input against a JSON Schema at the API boundary.
- Hash passwords with Argon2id via a vetted library — never hand-roll crypto.
- Constant-time comparison for secrets/tokens.
- Deny-by-default on authorization; check permissions server-side, every time.
- Generic error messages on auth paths (no user enumeration).
- Never log request bodies of auth endpoints.

## 4. Testing standards
- **Unit tests** for all core logic (authn, authz, password, tokens); target **≥ 80%** coverage.
- **Integration tests** for end-to-end flows against a real Postgres (containerized).
- **Security tests** for the scenarios in [04-Threat-Model.md](04-Threat-Model.md) §5.
- Tests must be deterministic; inject clock/crypto/random for reproducibility.
- CI blocks merge on failing tests or coverage below threshold.

## 5. Branching, commits, versioning
- **Trunk-based**: short-lived feature branches → PR → review → merge to `main`.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`,
  `security:`) to drive automated changelogs.
- **SemVer** for releases; security fixes get prompt patch releases and a changelog note.
- Every PR requires: green CI, at least one review, and updated tests/docs.

## 6. CI/CD gates (to implement in Phase 7)
- Lint + typecheck
- Unit + integration + security tests
- Dependency vulnerability scan (fail on high/critical) + SBOM
- Build reproducible container image
- On tag: publish release + changelog

## 7. Configuration & secrets
- All config via environment variables, validated at boot (fail fast on missing/invalid).
- Signing keys and DB credentials from env or a secret store; support key rotation (`kid`).
- Ship a `.env.example` with safe placeholders; never commit real secrets.
- **Secure defaults**: the out-of-the-box config must be safe to run.

## 8. Documentation expectations
- Public API changes update the OpenAPI spec and API contract doc in the same PR.
- Each module has a short README explaining its responsibility.
- Repo ships `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (responsible disclosure),
  and `LICENSE` (MIT) — created in Phase 6/7.

## 9. Definition of Done (per change)
- [ ] Meets the relevant requirement(s) (traceable to FR/NFR/SEC IDs)
- [ ] Tests added/updated and passing; coverage maintained
- [ ] Security rules (§3) satisfied
- [ ] Docs/OpenAPI updated
- [ ] No secrets in diff; dependency scan clean
- [ ] Reviewed and approved
