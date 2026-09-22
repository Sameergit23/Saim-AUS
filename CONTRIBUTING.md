# Contributing to Saim-AUS

Thanks for your interest in improving Saim-AUS! This is a security-focused project, so we
value correctness, clear tests, and safe defaults.

## Getting started

```bash
git clone https://github.com/Sameergit23/Saim-AUS.git
cd Saim-AUS
npm install
cp .env.example .env   # set a strong JWT_SECRET
npm test
```

No database is needed for development or tests (the in-memory store is the default).

## Development workflow

1. Create a short-lived branch off `main`.
2. Make your change with tests.
3. Ensure everything is green:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:coverage
   ```
4. Open a pull request. CI must pass (typecheck, lint, coverage gate, dependency audit).

## Standards

- **TypeScript**, `strict` mode. Keep the core (`src/core`) framework-agnostic.
- Follow the security coding rules in
  [docs/design/05-Engineering-Standards.md](docs/design/05-Engineering-Standards.md) —
  parameterized queries, validate all input, never log secrets, deny-by-default authz.
- **Never hand-roll crypto.** Use the established libraries already in the project.
- Add/adjust tests for every behavior change; keep coverage above the gate
  (≥ 90% lines / ≥ 88% branches on the covered modules).
- Use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `security:`, …) — they drive the changelog.
- Update the OpenAPI-affecting docs when you change the public API.

## Definition of Done

See the checklist in the Engineering Standards. In short: meets the requirement, tested,
security rules satisfied, docs updated, no secrets in the diff, reviewed.

## Reporting security issues

Please do **not** open public issues for vulnerabilities — see
[SECURITY.md](SECURITY.md) for private reporting.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
