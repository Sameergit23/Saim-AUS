# Integration Guide

How to protect your own application with Saim-AUS. The service is language-agnostic —
your app talks to it over HTTPS/JSON.

## The model

1. Users authenticate against Saim-AUS (`/api/v1/auth/*`) and receive a **short-lived JWT
   access token** plus a **rotating refresh token** (HttpOnly cookie for browsers).
2. Your app sends the access token as `Authorization: Bearer <token>` on its own API calls.
3. Your app **verifies** the token and reads the caller's identity, roles, and permissions.

There are two ways to verify a token — pick based on your needs.

## Option A — Local stateless verification (recommended, fast)

Verify the JWT signature yourself with the shared signing secret. No network call.

```ts
import { jwtVerify } from 'jose';

const key = new TextEncoder().encode(process.env.JWT_SECRET!); // same secret as Saim-AUS

export async function requirePermission(authHeader: string | undefined, permission: string) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('unauthenticated');
  const token = authHeader.slice('Bearer '.length);
  const { payload } = await jwtVerify(token, key, { issuer: 'saim-aus', algorithms: ['HS256'] });

  const perms = Array.isArray(payload.perms) ? (payload.perms as string[]) : [];
  if (!perms.includes(permission)) throw new Error('forbidden');
  return { userId: payload.sub as string, roles: payload.roles, perms };
}
```

- **Pros:** no latency, scales freely.
- **Trade-off:** a token is valid until it expires (default 15 min), even if the user's roles
  changed. This is the standard JWT trade-off; keep the access-token TTL short.

## Option B — Server-side introspection (instant revocation)

When you need changes to take effect immediately, call the service to check the token.
(The `/auth/introspect` endpoint is planned; today, Option A + a short TTL is the supported
path, and refresh re-resolves permissions on rotation.)

## Typical browser flow

```text
1. POST /api/v1/auth/register        { email, password }         -> 202 (verification email)
2. POST /api/v1/auth/verify-email    { token }                   -> 200
3. POST /api/v1/auth/login           { email, password }         -> 200 { accessToken } + cookie
4. GET  <your API>                   Authorization: Bearer <token>
5. On 401, POST /api/v1/auth/refresh (cookie)                    -> 200 { accessToken }
6. POST /api/v1/auth/logout          (cookie)                    -> 204
```

## Enforcing authorization

Effective permissions are the union of the user's roles' permissions. Check the `perms`
claim (or `roles`) against what your endpoint requires — **deny by default**.

Manage roles and permissions via the admin API (`/api/v1/admin/*`, requires `role:manage` /
`user:manage`). Create your own permission names for your app's capabilities, e.g.:

```bash
# as an admin
curl -X POST https://auth.example.com/api/v1/admin/permissions \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"invoice:approve","description":"Approve invoices"}'
```

## Explore the API

- Machine-readable spec: `GET /api/v1/openapi.json`
- Interactive UI (non-production by default): `GET /docs`
- Full contract: [../design/03-API-Contract.md](../design/03-API-Contract.md)
