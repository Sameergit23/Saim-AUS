import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import { buildTestHarness, tokenFromLink, type TestHarness } from './helpers.js';

describe('HTTP API', () => {
  let h: TestHarness;
  let app: FastifyInstance;

  beforeEach(async () => {
    h = buildTestHarness();
    app = await buildServer({
      config: h.config,
      auth: h.auth,
      rbac: h.rbac,
      tokens: h.tokens,
      logger: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const register = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password } });

  async function registerVerifyLogin(email = 'api@example.com', password = 'Str0ng!Passphrase') {
    await register(email, password);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromLink(h.sent.at(-1)!.link) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return res;
  }

  it('health endpoint responds ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('serves the generated OpenAPI spec', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBeTruthy();
    expect(spec.info.title).toBe('Saim-AUS API');
    expect(spec.paths['/api/v1/auth/login']).toBeTruthy();
  });

  it('register returns a generic 202', async () => {
    const res = await register('api@example.com', 'Str0ng!Passphrase');
    expect(res.statusCode).toBe(202);
    expect(res.json().message).toMatch(/verification link/i);
  });

  it('rejects malformed email at the schema boundary', async () => {
    const res = await register('not-an-email', 'Str0ng!Passphrase');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('completes register -> verify -> login and sets a refresh cookie', async () => {
    const res = await registerVerifyLogin();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.tokenType).toBe('Bearer');
    expect(body.user.email).toBe('api@example.com');
    const setCookie = res.headers['set-cookie'];
    expect(String(setCookie)).toContain('refresh_token=');
    expect(String(setCookie)).toContain('HttpOnly');
  });

  it('serves /me with a valid access token', async () => {
    const login = await registerVerifyLogin();
    const accessToken = login.json().accessToken as string;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('api@example.com');
    expect(res.json().roles).toContain('user');
  });

  it('rejects /me without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('refreshes using the cookie and rotates the token', async () => {
    const login = await registerVerifyLogin();
    const cookie = login.cookies.find((c) => c.name === 'refresh_token')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: cookie.value },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    const newCookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(newCookie?.value).toBeTruthy();
    expect(newCookie?.value).not.toBe(cookie.value);
  });

  it('logs out and clears the refresh cookie', async () => {
    const login = await registerVerifyLogin();
    const cookie = login.cookies.find((c) => c.name === 'refresh_token')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refresh_token: cookie.value },
    });
    expect(res.statusCode).toBe(204);
    // the rotated/again refresh should now fail
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: cookie.value },
    });
    expect(again.statusCode).toBe(401);
  });

  it('rejects an invalid email-verification token with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: 'not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
  });

  it('completes the forgot -> reset password flow over HTTP', async () => {
    await registerVerifyLogin('reset@example.com', 'Str0ng!Passphrase');

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email: 'reset@example.com' },
    });
    expect(forgot.statusCode).toBe(202);

    const resetToken = tokenFromLink(h.sent.at(-1)!.link);
    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token: resetToken, newPassword: 'Rese7!Passphrase' },
    });
    expect(reset.statusCode).toBe(200);

    // new password works, old one does not
    const good = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'reset@example.com', password: 'Rese7!Passphrase' },
    });
    expect(good.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'reset@example.com', password: 'Str0ng!Passphrase' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('changes the password for an authenticated user over HTTP', async () => {
    const login = await registerVerifyLogin('change@example.com', 'Str0ng!Passphrase');
    const accessToken = login.json().accessToken as string;

    const change = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { currentPassword: 'Str0ng!Passphrase', newPassword: 'Chang3d!Passphrase' },
    });
    expect(change.statusCode).toBe(200);

    const relogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'change@example.com', password: 'Chang3d!Passphrase' },
    });
    expect(relogin.statusCode).toBe(200);
  });
});
