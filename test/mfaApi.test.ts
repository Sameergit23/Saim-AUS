import type { FastifyInstance } from 'fastify';
import { Secret, TOTP } from 'otpauth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import { buildTestHarness, tokenFromLink, type TestHarness } from './helpers.js';

function currentCode(base32: string): string {
  return new TOTP({ digits: 6, period: 30, algorithm: 'SHA1', secret: Secret.fromBase32(base32) }).generate();
}

describe('MFA over HTTP', () => {
  let h: TestHarness;
  let app: FastifyInstance;

  beforeEach(async () => {
    h = buildTestHarness();
    app = await buildServer({
      config: h.config,
      auth: h.auth,
      rbac: h.rbac,
      mfa: h.mfa,
      tokens: h.tokens,
      logger: false,
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  async function registerVerify(email: string, password: string) {
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password } });
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromLink(h.sent.at(-1)!.link) },
    });
  }

  const login = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

  it('enroll -> confirm -> challenged login -> verify issues a session', async () => {
    const email = 'flow@example.com';
    const password = 'Str0ng!Passphrase';
    await registerVerify(email, password);

    // First login (no MFA) gives an access token used to enroll.
    const accessToken = (await login(email, password)).json().accessToken as string;
    const auth = { authorization: `Bearer ${accessToken}` };

    const enroll = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/enroll', headers: auth });
    expect(enroll.statusCode).toBe(200);
    const secret = enroll.json().secret as string;

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: auth,
      payload: { code: currentCode(secret) },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().recoveryCodes).toHaveLength(10);

    // Now login returns a challenge, not tokens.
    const challenge = await login(email, password);
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json().mfaRequired).toBe(true);
    expect(challenge.json().accessToken).toBeUndefined();
    const mfaToken = challenge.json().mfaToken as string;

    // Wrong code is rejected.
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { mfaToken, code: '000000' },
    });
    expect([401, 403]).toContain(bad.statusCode);

    // Correct code completes login with a session + refresh cookie.
    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { mfaToken, code: currentCode(secret) },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().accessToken).toBeTruthy();
    expect(verify.json().user.mfaEnabled).toBe(true);
    expect(String(verify.headers['set-cookie'])).toContain('refresh_token=');
  });

  it('requires authentication to enroll', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/enroll' });
    expect(res.statusCode).toBe(401);
  });
});
