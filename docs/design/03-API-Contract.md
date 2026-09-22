# API Contract
## Saim-AUS — Phase 1 Design

**Version:** 0.1 (Draft) · **Date:** 2026-09-22 · **Style:** REST/JSON over HTTPS

> Versioned under `/api/v1`. All requests/responses are JSON. All traffic is HTTPS only.
> This contract is the interface other applications integrate against (FR-33, FR-34).

---

## 1. Conventions

- **Base path:** `/api/v1`
- **Auth header:** `Authorization: Bearer <access_token>` for protected endpoints.
- **Refresh token:** delivered/consumed via `HttpOnly; Secure; SameSite=Strict` cookie
  (web) — mobile/native clients may receive it in the body and store it securely.
- **Content type:** `application/json`.
- **IDs:** UUID strings.
- **Timestamps:** ISO-8601 UTC.

### 1.1 Standard error model
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect.",
    "requestId": "b1f2…"
  }
}
```
- Auth failures use **generic** messages (no user enumeration — SEC-7).
- HTTP status codes: `400` validation, `401` unauthenticated, `403` forbidden,
  `404` not found, `409` conflict, `429` rate-limited, `500` server error.

### 1.2 Rate limiting
- Sensitive endpoints (`/auth/login`, `/auth/refresh`, `/auth/password/forgot`) are rate
  limited per IP and per account; `429` returns `Retry-After`.

---

## 2. Authentication endpoints

### `POST /auth/register`
Create an account (status `pending` until verified).
```json
// Request
{ "email": "user@example.com", "password": "S3cure!Passphrase" }
// 202 Accepted (generic — no enumeration)
{ "message": "If the email is valid, a verification link has been sent." }
```

### `POST /auth/verify-email`
```json
// Request
{ "token": "<from email link>" }
// 200 OK
{ "message": "Email verified. You can now log in." }
```

### `POST /auth/login`
```json
// Request
{ "email": "user@example.com", "password": "S3cure!Passphrase" }
// 200 OK  (refresh token set as HttpOnly cookie)
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": { "id": "…", "email": "user@example.com", "roles": ["user"] }
}
// 401 -> { "error": { "code": "INVALID_CREDENTIALS", ... } }   (generic)
// 429 -> rate limited / locked
```

### `POST /auth/refresh`
Rotates the refresh token (single-use) and returns a new access token.
```json
// Request: refresh cookie (or body for native)
// 200 OK  (new refresh cookie set)
{ "accessToken": "<JWT>", "tokenType": "Bearer", "expiresIn": 900 }
// 401 -> reuse/expired/invalid; token family revoked on reuse
```

### `POST /auth/logout`
Revokes the current refresh token (and clears cookie).
```json
// 204 No Content
```

### `POST /auth/password/forgot`
```json
// Request
{ "email": "user@example.com" }
// 202 Accepted (generic — no enumeration)
{ "message": "If the email is valid, a reset link has been sent." }
```

### `POST /auth/password/reset`
```json
// Request
{ "token": "<from email>", "newPassword": "An0ther!Passphrase" }
// 200 OK  (all existing sessions invalidated)
{ "message": "Password updated. Please log in again." }
```

### `POST /auth/password/change`  🔒
Requires current password; requires access token.
```json
// Request
{ "currentPassword": "…", "newPassword": "…" }
// 200 OK
{ "message": "Password changed." }
```

### (Optional) MFA — `POST /auth/mfa/enroll`, `POST /auth/mfa/verify`  🔒
TOTP enrollment/verification — stretch (FR-11).

---

## 3. Current-user endpoints  🔒

### `GET /me`
```json
// 200 OK
{
  "id": "…",
  "email": "user@example.com",
  "status": "active",
  "roles": ["user"],
  "permissions": ["self:read", "self:update"]
}
```

### `PATCH /me`
Update own profile (self-scoped fields only).

---

## 4. Admin endpoints  🔒 (require permission)

> All require a role granting the noted permission. Deny-by-default (SEC-9).

### Users
| Method & path | Permission | Purpose |
|---------------|------------|---------|
| `GET /admin/users` | `user:read` | List/search users (paginated) |
| `GET /admin/users/{id}` | `user:read` | View a user |
| `POST /admin/users/{id}/disable` | `user:manage` | Disable an account |
| `POST /admin/users/{id}/enable` | `user:manage` | Re-enable an account |

### Roles & permissions
| Method & path | Permission | Purpose |
|---------------|------------|---------|
| `GET /admin/roles` | `role:manage` | List roles |
| `POST /admin/roles` | `role:manage` | Create role |
| `PATCH /admin/roles/{id}` | `role:manage` | Update role |
| `DELETE /admin/roles/{id}` | `role:manage` | Delete role (blocked if `is_system`) |
| `GET /admin/permissions` | `role:manage` | List permissions |
| `POST /admin/roles/{id}/permissions` | `role:manage` | Attach permissions to role |
| `DELETE /admin/roles/{id}/permissions/{permId}` | `role:manage` | Detach permission |

### Role assignment
| Method & path | Permission | Purpose |
|---------------|------------|---------|
| `POST /admin/users/{id}/roles` | `user:manage` | Assign role(s) to a user |
| `DELETE /admin/users/{id}/roles/{roleId}` | `user:manage` | Revoke a role |

Example — assign a role:
```json
// POST /admin/users/{id}/roles
{ "roleIds": ["<role-uuid>"] }
// 200 OK
{ "id": "<user-id>", "roles": ["user", "editor"] }
// 403 -> { "error": { "code": "FORBIDDEN", "message": "Missing permission: user:manage" } }
```

---

## 5. Service / verification endpoint (for integrators)  🔒

### `POST /auth/introspect`
Lets a protected backend verify a token and read the principal (FR-34).
```json
// Request
{ "token": "<access token>" }
// 200 OK
{
  "active": true,
  "sub": "<user-id>",
  "roles": ["user"],
  "permissions": ["self:read"],
  "exp": 1758547200
}
// inactive/expired -> { "active": false }
```
> For most clients, stateless local JWT verification is preferred; `introspect` is for
> cases needing a server-side check or revocation confirmation.

---

## 6. Operational endpoints (unauthenticated)

| Path | Purpose |
|------|---------|
| `GET /health` | Liveness |
| `GET /ready` | Readiness (DB reachable, etc.) |
| `GET /api/v1/openapi.json` | Machine-readable API spec (generated) |

---

## 7. Token claim shape (access JWT)
```json
{
  "iss": "saim-aus",
  "sub": "<user-id>",
  "roles": ["user"],
  "perms": ["self:read", "self:update"],
  "permVer": 3,
  "iat": 1758546300,
  "exp": 1758547200,
  "kid": "key-2026-09"
}
```
- `permVer` allows invalidating stale permission snapshots after a role change.
- `kid` supports signing-key rotation.

## 8. Integration quick-flow (what an app does)
1. Send users to `/auth/register` → `/auth/login`.
2. Store the returned `accessToken`; keep the refresh cookie.
3. Call your own protected APIs with `Authorization: Bearer <accessToken>`.
4. On `401`, call `/auth/refresh` to get a new access token.
5. Enforce authorization by checking `perms` (or call `/auth/introspect`).

## 9. Contract stability
- Breaking changes ⇒ new version (`/api/v2`) per SemVer (ADR-008).
- OpenAPI spec is the source of truth and is generated from route schemas.

## 10. Phase 3 implementation notes (RBAC)
Additions made while implementing the admin surface:
- **`POST /admin/permissions`** (requires `role:manage`) — create a custom permission
  (`{ name, description? }`). Apps define their own capability names (e.g. `post:write`);
  this was added beyond the original draft so the permission catalog is extensible.
- **Bootstrapping the first admin** is out-of-band (no HTTP endpoint, by design): an
  operator runs `npm run grant-admin -- <email>` to grant the built-in `admin` role to a
  registered user. This avoids shipping a privileged self-service escalation path.
- **`introspect`** and **MFA** endpoints from §2/§5 remain planned (not in the Phase 3 build).
- Permission changes apply on the user's next login/refresh (token-embedded snapshot);
  instant invalidation via `permVer` is deferred to Phase 4.
