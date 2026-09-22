# The Making of Saim-AUS
### A complete, plain-English guide to how this authentication system was built

> This is the "story book" of the project. It explains **what Saim-AUS is**, **why every
> technology was chosen**, **how it was built step by step**, **how each feature actually
> works**, and **the real problems faced along the way and how they were solved** — written
> so that both a developer *and* a non-technical person can follow it. If someone ever asks
> "how did you build this?" or "how does *that* feature work?", the answer is in here.

---

## Table of contents

1. [What is Saim-AUS? (and why it exists)](#1-what-is-saim-aus-and-why-it-exists)
2. [What it can do — features in plain English](#2-what-it-can-do--features-in-plain-english)
3. [The technology, and why each piece was chosen](#3-the-technology-and-why-each-piece-was-chosen)
4. [How it was built — the step-by-step journey](#4-how-it-was-built--the-step-by-step-journey)
5. [How each feature works (the "how did you build X?" reference)](#5-how-each-feature-works)
6. [Problems faced and how they were solved](#6-problems-faced-and-how-they-were-solved)
7. [How it's tested](#7-how-its-tested)
8. [How it's deployed — going live](#8-how-its-deployed--going-live)
9. [Interview cheat-sheet — quick answers](#9-interview-cheat-sheet)
10. [Glossary — every term in plain English](#10-glossary)

---

## 1. What is Saim-AUS? (and why it exists)

**Saim-AUS is an authentication and authorization system** — the part of an app that answers
two questions:

- **Authentication ("who are you?")** — proving a user is who they claim to be (email + password, and optionally a second factor).
- **Authorization ("what are you allowed to do?")** — deciding what an authenticated user may access (regular user vs. admin, etc.).

**Why build it?** Almost every app needs logins. Getting login *right* is deceptively hard —
passwords must be stored safely, sessions must be protected, and a single mistake can leak
everyone's account. Most small projects re-invent this and get it subtly wrong. Saim-AUS is a
**free, open-source, reusable building block** that handles all of this correctly, so any
project can plug it in instead of rebuilding it.

**What kind of thing is it, technically?** It's a **headless service** — a backend API with no
built-in screens. Think of it like Auth0, Firebase Auth, or Supabase Auth: those are backend
services, and *your* app provides the login screen and calls their API. Saim-AUS works the same
way. It owns the hard, security-critical logic; the app that uses it owns the user interface.

> **In one sentence:** Saim-AUS is a self-hostable "login and permissions" service that any app
> can call over the internet to register users, log them in, and control what they can do.

---

## 2. What it can do — features in plain English

- **Sign up** with an email and password, and **verify the email** with a link.
- **Log in / log out**, receiving secure tokens that prove who you are.
- **Stay logged in** safely, with tokens that refresh automatically and detect theft.
- **Change and reset passwords** (the classic "forgot password" flow).
- **Roles and permissions (RBAC)** — mark some users as admins; control who can do what.
- **An admin API** — manage users, create roles/permissions, assign them.
- **Protection against attacks** — brute-force lockout, rate limiting, CSRF defense, security headers.
- **Two-factor authentication (MFA/TOTP)** — the "authenticator app" 6-digit codes, with backup recovery codes.
- **Real email delivery** (when configured) for verification and reset messages.
- **Live, interactive docs** for developers (Swagger UI) generated automatically from the code.

Everything is exposed as a clean web API, documented, tested, and deployable with one file.

---

## 3. The technology, and why each piece was chosen

Every choice below is recorded as an **Architecture Decision Record (ADR)** in
`docs/design/00-Decisions-ADR.md`. Here's the plain-English version.

| Choice | What it is | Why it was chosen |
|--------|------------|-------------------|
| **Node.js + TypeScript** | The programming language/runtime | Huge ecosystem, easy for anyone to run and extend. **TypeScript** adds type-checking, which catches mistakes before the code runs — important for security code. |
| **Fastify** | The web framework (handles HTTP requests) | Fast, and validates incoming data against a schema by default (rejects malformed/malicious input automatically). |
| **PostgreSQL** | The database | Roles and permissions are naturally "relational" (users ↔ roles ↔ permissions). Postgres enforces those relationships reliably. Free and everywhere. |
| **In-memory store** | A fake database used for development/tests | Lets you run and test the whole system with **no database install** — perfect for trying it out. |
| **Argon2id** | The password-hashing algorithm | The current best practice for storing passwords. It's deliberately slow and memory-heavy, which makes cracking stolen password data extremely expensive. |
| **JWT (JSON Web Tokens)** | The "proof of login" tokens | Self-contained, digitally signed tokens. The server can verify them instantly without a database lookup, so it scales well. |
| **jose** | The library that signs/verifies JWTs | Well-maintained, modern, and refuses insecure token tricks. |
| **otpauth** | The two-factor (TOTP) library | Implements the standard authenticator-app algorithm correctly, so we don't hand-roll crypto. |
| **nodemailer** | Sends real emails over SMTP | Works with any email provider (Resend, SendGrid, Gmail, …). |
| **@fastify/helmet** | Sets security headers on responses | One line adds a suite of browser-protection headers. |
| **Vitest** | The testing tool | Fast, runs the 138 automated tests and measures coverage. |
| **Docker** | Packages the app into a portable container | "It runs the same everywhere" — the key to easy deployment. |
| **GitHub Actions** | Automation (CI/CD) | Every code change is automatically type-checked, linted, tested, and security-scanned. |
| **Render** | The hosting platform | One config file provisions the app *and* a managed database. |
| **MIT License** | The legal license | The most permissive — anyone can use it in any project, including commercial, for free. |

**The golden rule behind these choices:** *never hand-roll security-critical code.* Passwords,
tokens, and 2FA all use battle-tested libraries rather than custom code, because a subtle bug in
homemade crypto is how real breaches happen.

---

## 4. How it was built — the step-by-step journey

The project deliberately followed the **SDLC (Software Development Life Cycle)** — a disciplined
order of phases, instead of jumping straight to code. This is *why* the result is solid rather
than a pile of features. The full roadmap lives in `docs/Roadmap.md`; here's the tour.

**Phase 0 — Planning & Requirements.** Before writing any code, we wrote down *what* the system
must do and *why*: a full requirements spec (`docs/SRS-Requirements.md`) listing every feature,
every security rule, and how success would be measured. **Lesson:** decide what you're building
before you build it.

**Phase 1 — Design & Architecture.** We decided *how*: the technology stack, the database
design, the exact API (every endpoint), and — crucially for a security product — a **threat
model** (`docs/design/04-Threat-Model.md`) that lists how an attacker might try to break in and
how each attack is blocked. We also set the ground rules (coding standards).

**Phase 2 — Core Authentication.** The first real code: register, verify email, log in, log out,
password reset, and the token system. Passwords hashed with Argon2id; tokens issued and verified.
The code was structured in **layers** so the security logic doesn't depend on the web framework
or the database (making it testable and portable).

**Phase 3 — Authorization / RBAC.** Added roles and permissions and the **guards** that enforce
them: every protected action checks "does this user have the required permission?" and **denies
by default**. Plus an admin API to manage it all.

**Phase 4 — Security Hardening.** Turned "works" into "safe to trust": brute-force **lockout**,
**CSRF** protection, security headers, **signing-key rotation**, and automated **vulnerability
scanning** in CI.

**Phase 5 — Testing & QA.** Wrote a comprehensive test suite and put a **coverage gate** in place
— the build fails if test coverage drops below ~90%. This is what keeps the system correct as it
changes.

**Phases 6–7 — Documentation, Packaging & Release.** Auto-generated API docs (Swagger),
integration and deployment guides, a Dockerfile, and release automation. Then tagged **v1.0.0**.

**Follow-on — MFA/TOTP and production email.** Added two-factor authentication and real SMTP
email, making it genuinely production-ready.

**Deployment.** Finally, took it live on Render with a one-file blueprint.

**Why this order matters:** each phase depends on the one before it. You can't harden security
before you have auth; you can't meaningfully test before there's something to test; you shouldn't
release before it's tested. Doing it in order is what makes the result trustworthy.

---

## 5. How each feature works

This is the "**how did you build that feature?**" reference. Each entry explains the *idea* in
plain English, then *how it actually works*, then *where the code lives*.

### 5.1 Sign-up & email verification
**Idea:** When you register, the account isn't fully active until you prove you own the email.
**How it works:** On register, the system validates the input, **hashes** the password, saves the
user as "pending," creates a one-time, time-limited verification token, and emails a link
containing it. Clicking it (calling `verify-email` with the token) activates the account. The
response is deliberately generic ("if the email is valid, a link was sent") so an attacker can't
use it to discover which emails are registered. *Code: `src/core/authn/authService.ts`.*

### 5.2 Password security
**Idea:** Even if someone steals the database, they must not be able to read anyone's password.
**How it works:** Passwords are never stored. Instead we store an **Argon2id hash** — a one-way
scramble with a unique random "salt" per user. Verifying a login re-hashes the entered password
and compares. Argon2id is intentionally slow and memory-hungry, so guessing millions of passwords
is prohibitively expensive. *Code: `src/core/password/passwordService.ts`.*

### 5.3 Login & tokens (the two-token system)
**Idea:** After logging in, the app needs a way to prove "I'm still me" on every request —
without sending the password each time.
**How it works:** Login issues **two** tokens:
- A short-lived **access token** (a signed JWT, ~15 minutes). It's sent on every request and
  verified instantly by checking its signature — no database lookup. It also carries the user's
  roles and permissions.
- A long-lived **refresh token** (stored as a hash in the database, delivered as a secure cookie).
  When the access token expires, the app quietly swaps the refresh token for a new pair.

**Why two?** The short access token limits the damage if it's ever stolen (it expires fast); the
refresh token lets users stay logged in without re-entering their password. *Code:
`src/core/tokens/tokenService.ts`, `src/core/authn/authService.ts`.*

### 5.4 Refresh rotation & theft detection
**Idea:** Detect if a refresh token has been stolen and used.
**How it works:** Every time a refresh token is used, it's **rotated** — the old one is consumed
and a brand-new one issued. Tokens are tracked in "families." If an *already-used* token is
presented again (a sign that an attacker copied it), the system revokes the **entire family**,
logging out both the attacker and the victim so the theft can be noticed and fixed. *Code:
`src/core/authn/authService.ts` (the `refresh` function).*

### 5.5 Roles & permissions (RBAC)
**Idea:** Different users can do different things. Admins manage the system; regular users manage
only themselves.
**How it works:** Three concepts — **Users**, **Roles** (e.g. `admin`, `user`), and
**Permissions** (e.g. `user:manage`, `role:manage`). A user has roles; a role grants permissions.
A user's effective permissions are the combination of all their roles' permissions. These
permissions are baked into the access token at login. *Code: `src/core/authz/rbacService.ts`,
database tables in `docs/design/02-Database-Schema.md`.*

### 5.6 Enforcement — "deny by default"
**Idea:** A protected action should be refused **unless** the user explicitly has permission.
**How it works:** Every admin endpoint runs through a **guard** that (1) checks the access token
is valid, then (2) checks the token contains the required permission. No permission → `403
Forbidden`. There is no "allow by accident" — the default is always *no*. *Code:
`src/api/authGuard.ts`, applied in `src/api/routes/admin.ts`.*

### 5.7 Brute-force lockout
**Idea:** Stop attackers from guessing passwords by trying thousands of times.
**How it works:** Failed login attempts are counted per email within a time window. After too many
(default 5), further attempts are blocked with `429 Too Many Requests` — even correct ones —
until the window passes. It counts attempts for *unknown* emails too, so it can't be used to
discover which accounts exist. *Code: `src/core/authn/authService.ts` (the lockout check in
`login`).*

### 5.8 CSRF protection
**Idea:** Stop a malicious website from tricking your browser into making authenticated requests.
**How it works:** The refresh cookie is marked `SameSite=Strict` (browsers won't send it from
other sites), and cookie-based requests additionally check the request's **Origin** against an
allowlist. *Code: `src/api/csrfGuard.ts`.*

### 5.9 Security headers
**Idea:** Tell browsers to behave more safely.
**How it works:** The `helmet` library adds response headers like `Strict-Transport-Security`
(force HTTPS), `X-Content-Type-Options: nosniff`, and `X-Frame-Options` (block clickjacking).
*Code: `src/api/server.ts`.*

### 5.10 Signing-key rotation
**Idea:** Be able to change the secret key that signs tokens without logging everyone out.
**How it works:** The system can verify tokens against the *current* key **and** a *previous* key.
You roll to a new key, keep the old one accepted until old tokens expire, then remove it. *Code:
`src/core/tokens/tokenService.ts`.*

### 5.11 Two-factor authentication (MFA/TOTP)
**Idea:** Even if a password is stolen, an attacker still can't log in without the user's phone.
**How it works:** A user "enrolls" by scanning a QR code into an authenticator app, which then
generates a new 6-digit code every 30 seconds (the standard **TOTP** algorithm). We confirm
enrollment with one code, then hand the user **recovery codes** (one-time backups in case the
phone is lost). After that, logging in becomes **two steps**: password first (which returns a
short "MFA challenge" ticket instead of a session), then the 6-digit code, which completes the
login. The TOTP secret is **encrypted** in the database, and recovery codes are stored hashed.
*Code: `src/core/mfa/mfaService.ts`, secret encryption in `src/infra/encryption.ts`.*

### 5.12 Email delivery
**Idea:** Actually send verification and reset emails to real inboxes.
**How it works:** When SMTP settings are configured, the system sends real emails via any provider;
when they aren't (e.g. local development), it simply logs the links to the console so you can still
test. *Code: `src/infra/smtpMailer.ts`, chosen in `src/index.ts`.*

### 5.13 Auto-generated API docs
**Idea:** Developers integrating the system should have accurate, interactive documentation.
**How it works:** The API description (OpenAPI spec) is **generated from the code's own
validation schemas**, so the docs can never drift from reality. A Swagger UI (at `/docs`) lets you
try every endpoint in the browser. *Code: `src/api/server.ts`.*

---

## 6. Problems faced and how they were solved

Real projects hit real snags. These are the actual problems encountered while building Saim-AUS —
kept here honestly, because *how you solve problems* is often what people really want to know.

### 6.1 A vulnerable web framework
**Problem:** A security scan flagged several vulnerabilities — in the web framework itself
(Fastify v4). **Fix:** Upgraded to Fastify v5, which patched them. **Lesson:** for a security
product, you can't ship on a framework with known holes; automated scanning in CI catches this.

### 6.2 Requests with no body were rejected
**Problem:** Some endpoints (like "refresh" and "logout") don't need a request body, but browsers
often still send a `Content-Type: application/json` header. The framework's default parser errored
on the empty body. **Fix:** Added a small parser that treats an empty JSON body as "no body."

### 6.3 Client mistakes were reported as server errors
**Problem:** When a request was malformed, the API returned `500` (server error) — which wrongly
blames the server. **Fix:** Mapped these to the correct `4xx` (client error) codes. **How it was
found:** by running the app for real over HTTP, not just via in-memory tests — the two bugs above
were caught this way.

### 6.4 Getting to trustworthy test coverage
**Problem:** "It passes some tests" isn't good enough for auth. **Fix:** Added a **coverage gate**
that fails the build if coverage drops below ~90%, then wrote tests for every flow — including
tricky ones like token expiry (tested deterministically with a fake clock) and
injection-style inputs. Result: **138 tests, ~98% coverage.**

### 6.5 The v1.0.0 release tagged the wrong code
**Problem:** When cutting the first release, the version tag `v1.0.0` accidentally landed on a very
old commit (from an out-of-date second copy of the project), so it would have released only a
fraction of the features. **Fix:** Deleted the tag and re-created it on the correct, latest commit.
**Lesson:** always tag from the up-to-date folder; verify what a tag points to before trusting it.

### 6.6 Deployment failure #1 — a missing tool
**Problem:** The first cloud deploy failed instantly. The hosting platform built the app with
"production mode" on, which skipped installing development tools — including the one used to run
the app. **Fix:** Told the Docker build to install those tools regardless.

### 6.7 Deployment failure #2 — a garbled start command
**Problem:** The deploy still failed with `"npm run migrate && npm start: not found"`. The platform
was mis-reading the quotes in the start command and treating the whole line as one program name.
**Fix:** Moved the command into a named script (`start:prod`) and called it by that simple name, so
there were no quotes for the platform to garble. **Lesson:** keep deployment commands simple;
different platforms parse them differently.

### 6.8 The docs "Authorize" button didn't send the token
**Problem:** In the interactive docs, pasting a login token into "Authorize" didn't actually attach
it to protected requests, so they returned `401`. **Fix:** Explicitly marked each protected
endpoint in the API spec as "requires a token," which tells the docs UI to send it. **Bonus:** this
also made the docs correctly show a padlock on protected endpoints.

### 6.9 No real emails
**Problem:** Early on, the system only *logged* verification links to the console — fine for
testing, useless for real users. **Fix:** Added optional SMTP email so real messages are sent when
configured, with a safe fallback to logging when not.

### 6.10 Windows line-ending noise
**Problem:** On Windows, Git kept warning about line endings (LF vs CRLF). **Reality:** harmless —
purely cosmetic — but worth knowing so it isn't mistaken for a real error.

---

## 7. How it's tested

Testing is what makes a security system trustworthy over time. Saim-AUS has **138 automated
tests** covering:

- **Unit tests** — each piece in isolation (password hashing, token signing, permission logic).
- **Integration tests** — full flows over the real HTTP API (register → verify → login → access a
  protected route).
- **Security tests** — brute-force lockout, token reuse/theft detection, CSRF rejection,
  injection-style inputs treated as harmless text, no user enumeration.
- **Edge cases** — expired tokens (tested with a controllable fake clock so time-based logic is
  deterministic), malformed input, disabled accounts.

A **coverage gate** in the automated pipeline (GitHub Actions) fails the build if coverage falls
below the threshold, and a **dependency scanner** fails it if any production library has a known
vulnerability. So every change is automatically proven safe before it can ship.

*How to run them:* `npm test` (and `npm run test:coverage` for the coverage report).

---

## 8. How it's deployed — going live

The whole system is packaged in a **Docker** container (a portable box that runs identically
anywhere) and ships with a **`render.yaml`** blueprint. On the Render hosting platform, that one
file:

1. Creates a managed **PostgreSQL** database.
2. Builds the app's container.
3. **Generates the secret keys** automatically.
4. Runs the database **migrations** (creating the tables).
5. Starts the service, with a **health check** so the platform knows it's alive.

Pushing new code to the `main` branch automatically re-deploys. For real user emails, you add your
SMTP provider's settings; the first admin is created with a single command
(`npm run grant-admin -- you@example.com`). Full instructions live in
`docs/guides/Deployment.md`.

---

## 9. Interview cheat-sheet

Short, confident answers to the questions people actually ask.

**"How does login work?"**
> The user sends email + password. We verify the password against its Argon2id hash. If correct,
> we issue a short-lived signed JWT access token plus a rotating refresh token. The app sends the
> access token on each request; the server verifies its signature instantly.

**"How are passwords stored?"**
> Never in plain text. We store an Argon2id hash with a unique salt per user — a slow, one-way
> function, so even a stolen database can't reveal passwords.

**"What's the difference between the two tokens?"**
> The access token is short-lived (15 min) and self-contained, so verifying it needs no database
> lookup. The refresh token is long-lived, stored server-side, and rotated on each use — if a used
> one reappears, we treat it as theft and revoke the whole family.

**"What is RBAC and how did you implement it?"**
> Role-Based Access Control: users get roles, roles grant permissions. Every protected action
> checks for the required permission and denies by default. Permissions are embedded in the access
> token so checks are instant.

**"How do you stop brute-force attacks?"**
> Rate limiting plus per-account lockout after several failed attempts, with a time-based
> auto-unlock — and it behaves the same for unknown emails so it can't be used to probe accounts.

**"How does two-factor auth work?"**
> Standard TOTP. The user scans a QR into an authenticator app; login becomes two steps — password,
> then a 6-digit code. We also issue one-time recovery codes, and the TOTP secret is encrypted at
> rest.

**"How do you know it's secure / correct?"**
> A threat model drove the design, there are 138 automated tests at ~98% coverage, security
> scanning runs in CI, and it uses vetted libraries for all crypto instead of hand-rolled code.

**"How is it deployed?"**
> Dockerized, with a one-file blueprint that provisions the app and a managed Postgres, runs
> migrations, and health-checks the service. Every push auto-deploys.

---

## 10. Glossary

- **Authentication** — proving *who* you are (logging in).
- **Authorization** — deciding *what* you're allowed to do.
- **Hashing** — a one-way scramble of data. You can check a match, but you can't reverse it. Used for passwords.
- **Salt** — random data mixed into each password before hashing, so identical passwords hash differently.
- **Argon2id** — a modern, deliberately slow password-hashing algorithm; today's best practice.
- **JWT (JSON Web Token)** — a signed, self-contained token carrying facts about the user; anyone with the key can verify it wasn't tampered with.
- **Access token** — a short-lived JWT sent on each request to prove you're logged in.
- **Refresh token** — a longer-lived token used to get a new access token without re-entering your password.
- **Token rotation** — replacing a refresh token with a new one each time it's used, to detect theft.
- **RBAC (Role-Based Access Control)** — permissions granted through roles rather than to each user individually.
- **Role / Permission** — a role (e.g. `admin`) is a bundle of permissions (e.g. `user:manage`).
- **Deny by default** — the security stance where actions are refused unless explicitly permitted.
- **CSRF (Cross-Site Request Forgery)** — an attack where another site tricks your browser into making requests; blocked with `SameSite` cookies and Origin checks.
- **Rate limiting** — capping how many requests something can make in a time window.
- **Lockout** — temporarily blocking logins after too many failures.
- **MFA / 2FA** — Multi/Two-Factor Authentication: requiring a second proof (a code) beyond the password.
- **TOTP** — Time-based One-Time Password: the 6-digit codes authenticator apps generate.
- **Recovery codes** — one-time backup codes to log in if you lose your 2FA device.
- **SDLC (Software Development Life Cycle)** — the disciplined phases of building software (plan → design → build → test → release).
- **CI/CD** — Continuous Integration/Delivery: automation that tests and ships code on every change.
- **Docker / container** — a portable package of the app that runs identically everywhere.
- **Migration** — a script that sets up or updates the database tables.
- **OpenAPI / Swagger** — a standard description of an API, and a UI to explore it.
- **Environment variable** — a configuration value (like a secret key) provided from outside the code, never hard-coded.

---

### Closing note

Saim-AUS wasn't built by piling up features — it was built the way real, trustworthy software is
built: **decide what and why, design it, build it in layers, harden it, test it exhaustively,
document it, and only then release and deploy.** That discipline is the real story here, and it's
why every part of this system can be explained, defended, and trusted.

*For the precise details of any part, see the design documents in `docs/design/` and the source
code under `src/`.*
