# Deployment & Operations Guide

How to run Saim-AUS safely in production.

## Requirements

- Node.js 20+ (or the provided container image)
- PostgreSQL 14+
- TLS termination in front of the service (reverse proxy / load balancer)

## 1. Configuration

Configure entirely via environment variables (see [`.env.example`](../../.env.example)).
The service **fails fast at boot** if required values are missing or invalid.

Production must-haves:

| Variable | Notes |
|----------|-------|
| `NODE_ENV=production` | Disables the interactive `/docs` UI by default |
| `JWT_SECRET` | **Strong random ≥ 32 chars.** `openssl rand -base64 48` |
| `STORAGE=postgres` | Use Postgres, never the in-memory store |
| `DATABASE_URL` | Postgres connection string |
| `COOKIE_SECURE=true` | Send the refresh cookie only over HTTPS |
| `ALLOWED_ORIGINS` | Your app origins, for CSRF protection of cookie flows |
| `PUBLIC_BASE_URL` | Public URL used to build email links |

## 2. Database

Apply the schema before first start:

```bash
npm run migrate     # or: node dist/... in the container (see below)
```

## 3. One-click deploy on Render (recommended for a managed setup)

The repo ships a [`render.yaml`](../../render.yaml) blueprint that provisions the service
**and** a managed PostgreSQL, generates the secrets, runs migrations, and starts it.

1. Push the repo to GitHub (already done for this project).
2. In Render: **New → Blueprint**, connect the repo, and apply. Render reads `render.yaml`
   and creates the database + web service. `JWT_SECRET` and `MFA_SECRET_KEY` are generated
   automatically; `DATABASE_URL` is wired from the managed database.
3. Wait for the first deploy (it runs `npm run migrate` then starts). Your API is live at
   `https://<service>.onrender.com` — visit `/health` to confirm.
4. Create your first admin. Open the service's **Shell** in the Render dashboard and run:
   ```bash
   npm run grant-admin -- you@example.com
   ```

### Enabling real emails on Render

By default (no SMTP configured) verification/reset links are only written to the logs. To
send real emails, add these environment variables to the web service in the Render dashboard
(from any SMTP provider — Resend, SendGrid, Mailgun, SES, …), then redeploy:

`SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (a verified sender).

> Notes: the free web instance sleeps after inactivity (cold starts), and Render's free
> PostgreSQL is time-limited — upgrade the plans in `render.yaml` for anything long-lived.
> The same blueprint idea maps to Railway and Fly.io; only the config file format differs.

## 4. Run with Docker

```bash
docker build -t saim-aus .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e STORAGE=postgres \
  -e DATABASE_URL="postgres://user:pass@db:5432/saim_aus" \
  -e COOKIE_SECURE=true \
  -e ALLOWED_ORIGINS="https://app.example.com" \
  saim-aus
```

The published image (once released) is available from GitHub Container Registry:
`ghcr.io/sameergit23/saim-aus`.

## 5. Create the first admin

Register a user through the API, then promote them:

```bash
npm run grant-admin -- you@example.com
```

## 6. TLS & reverse proxy

Terminate TLS at your proxy (nginx, Caddy, a cloud LB) and forward to the service. The
service trusts `X-Forwarded-*` (`trustProxy` is on) so `request.ip` is correct for rate
limiting. Enable HSTS at the proxy; the app also emits an HSTS header.

## 7. Scaling

Access-token verification is **stateless**, so run multiple instances behind the LB — they
share only the Postgres database. Refresh tokens, RBAC, and audit live in Postgres.

## 8. Key rotation

To rotate the JWT signing secret without logging everyone out:

1. Set `JWT_PREVIOUS_SECRET` to the current secret.
2. Set `JWT_SECRET` to a new strong value; restart.
3. New tokens are signed with the new key; old tokens still verify.
4. After the old access tokens have expired (≥ access TTL), remove `JWT_PREVIOUS_SECRET`.

## 9. Production hardening checklist

- [ ] `JWT_SECRET` is strong, unique, and stored in a secret manager (not in the image)
- [ ] `STORAGE=postgres`, least-privilege DB credentials
- [ ] `COOKIE_SECURE=true` and TLS enforced end-to-end
- [ ] `ALLOWED_ORIGINS` set to your real app origins
- [ ] `/docs` UI disabled (default in production) unless intentionally exposed
- [ ] Rate limits / lockout thresholds reviewed for your traffic
- [ ] Backups and retention configured for the database
- [ ] Log shipping in place (audit log is in the `audit_log` table)
- [ ] CI dependency scanning green before each deploy

## 10. Operations

- Liveness: `GET /health` · Readiness: `GET /ready`
- Audit trail: `audit_log` table (login, logout, role changes, lockouts, …)
- Consider periodic cleanup of expired `refresh_tokens`, `email_tokens`, and old
  `login_attempts` rows.
