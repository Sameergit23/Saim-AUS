import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createTokenService } from '../src/core/tokens/tokenService.js';
import { AppError } from '../src/core/domain/errors.js';

const secret = 'test-secret-that-is-at-least-32-characters-long';

describe('tokenService', () => {
  const svc = createTokenService({ secret, kid: 'test', accessTokenTtl: '15m' });

  it('signs and verifies an access token round-trip', async () => {
    const token = await svc.signAccessToken({
      userId: 'user-1',
      roles: ['user'],
      perms: ['self:read'],
      permVer: 1,
    });
    const claims = await svc.verifyAccessToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.roles).toEqual(['user']);
    expect(claims.perms).toEqual(['self:read']);
  });

  it('rejects a token signed with a different secret', async () => {
    const other = createTokenService({ secret: `${secret}-different`, kid: 'x', accessTokenTtl: '15m' });
    const token = await other.signAccessToken({ userId: 'u', roles: [], perms: [], permVer: 1 });
    await expect(svc.verifyAccessToken(token)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a tampered token', async () => {
    const token = await svc.signAccessToken({ userId: 'u', roles: [], perms: [], permVer: 1 });
    const tampered = `${token.slice(0, -3)}abc`;
    await expect(svc.verifyAccessToken(tampered)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects an unsigned ("alg:none") token', async () => {
    // header {"alg":"none"} . payload . empty signature
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u', iss: 'saim-aus' })).toString('base64url');
    const forged = `${header}.${payload}.`;
    await expect(svc.verifyAccessToken(forged)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects garbage input', async () => {
    await expect(svc.verifyAccessToken('not.a.jwt')).rejects.toBeInstanceOf(AppError);
  });

  it('defensively coerces malformed claim types to safe defaults', async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({ roles: 'admin', perms: 'x', permVer: 'nope' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('saim-aus')
      .setSubject('u')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key);
    const claims = await svc.verifyAccessToken(token);
    expect(claims.roles).toEqual([]);
    expect(claims.perms).toEqual([]);
    expect(claims.permVer).toBe(0);
  });

  it('rejects an expired token', async () => {
    const key = new TextEncoder().encode(secret);
    const expired = await new SignJWT({ roles: [], perms: [], permVer: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('saim-aus')
      .setSubject('u')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // expired a minute ago
      .sign(key);
    await expect(svc.verifyAccessToken(expired)).rejects.toBeInstanceOf(AppError);
  });

  describe('key rotation', () => {
    const oldSecret = 'old-secret-that-is-at-least-32-characters-long!';
    const newSecret = 'new-secret-that-is-at-least-32-characters-long!';

    it('verifies a token signed with a previous secret after rotation', async () => {
      const oldService = createTokenService({ secret: oldSecret, kid: 'k1', accessTokenTtl: '15m' });
      const rotated = createTokenService({
        secret: newSecret,
        previousSecrets: [oldSecret],
        kid: 'k2',
        accessTokenTtl: '15m',
      });

      const oldToken = await oldService.signAccessToken({ userId: 'u', roles: [], perms: [], permVer: 1 });
      // Token signed with the old key still verifies during rotation.
      await expect(rotated.verifyAccessToken(oldToken)).resolves.toMatchObject({ sub: 'u' });

      // New tokens are signed with the new key and verify too.
      const newToken = await rotated.signAccessToken({ userId: 'u', roles: [], perms: [], permVer: 1 });
      await expect(rotated.verifyAccessToken(newToken)).resolves.toMatchObject({ sub: 'u' });
    });

    it('rejects a token once its signing key is dropped from rotation', async () => {
      const onlyNew = createTokenService({ secret: newSecret, kid: 'k2', accessTokenTtl: '15m' });
      const oldService = createTokenService({ secret: oldSecret, kid: 'k1', accessTokenTtl: '15m' });
      const oldToken = await oldService.signAccessToken({ userId: 'u', roles: [], perms: [], permVer: 1 });
      await expect(onlyNew.verifyAccessToken(oldToken)).rejects.toBeInstanceOf(AppError);
    });
  });
});
