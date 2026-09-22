import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import { buildTestHarness, tokenFromLink, type TestHarness } from './helpers.js';

async function buildWith(h: TestHarness): Promise<FastifyInstance> {
  const app = await buildServer({
    config: h.config,
    auth: h.auth,
    rbac: h.rbac,
    mfa: h.mfa,
    tokens: h.tokens,
    logger: false,
  });
  await app.ready();
  return app;
}

async function registerVerifyLogin(app: FastifyInstance, h: TestHarness, email: string, password: string) {
  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password } });
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: { token: tokenFromLink(h.sent.at(-1)!.link) },
  });
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
}

describe('security hardening', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  describe('security headers (helmet)', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
      const h = buildTestHarness();
      app = await buildWith(h);
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('CSRF protection on cookie flows', () => {
    it('rejects a cookie-bearing refresh from a disallowed origin', async () => {
      const h = buildTestHarness();
      h.config.allowedOrigins = ['https://app.example.com'];
      app = await buildWith(h);

      const login = await registerVerifyLogin(app, h, 'csrf@example.com', 'Str0ng!Passphrase');
      const cookie = login.cookies.find((c) => c.name === 'refresh_token')!;

      const evil = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { refresh_token: cookie.value },
        headers: { origin: 'https://evil.example.com' },
      });
      expect(evil.statusCode).toBe(403);
      expect(evil.json().error.code).toBe('CSRF_REJECTED');

      const good = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { refresh_token: cookie.value },
        headers: { origin: 'https://app.example.com' },
      });
      expect(good.statusCode).toBe(200);
    });
  });

  describe('account lockout over HTTP', () => {
    it('returns 429 after too many failed logins', async () => {
      const h = buildTestHarness();
      app = await buildWith(h);
      await registerVerifyLogin(app, h, 'locked@example.com', 'Str0ng!Passphrase');

      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'locked@example.com', password: 'WrongPassword!1' },
        });
      }
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'locked@example.com', password: 'Str0ng!Passphrase' },
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('TOO_MANY_ATTEMPTS');
    });
  });
});
