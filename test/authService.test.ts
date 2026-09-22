import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/core/domain/errors.js';
import {
  buildTestHarness,
  registerAndVerify,
  tokenFromLink,
  type TestHarness,
} from './helpers.js';

describe('authService', () => {
  let h: TestHarness;
  beforeEach(() => {
    h = buildTestHarness();
  });

  describe('registration & verification', () => {
    it('registers a pending user and sends a verification email', async () => {
      await h.auth.register('new@example.com', 'Str0ng!Passphrase', {});
      const user = await h.storage.users.findByEmail('new@example.com');
      expect(user?.status).toBe('pending');
      expect(user?.emailVerified).toBe(false);
      expect(h.sent.at(-1)?.kind).toBe('verify');
    });

    it('assigns the default "user" role on registration', async () => {
      await h.auth.register('new@example.com', 'Str0ng!Passphrase', {});
      const user = await h.storage.users.findByEmail('new@example.com');
      expect(await h.storage.roles.getRoleNames(user!.id)).toContain('user');
    });

    it('does not reveal whether an email already exists (no enumeration)', async () => {
      await h.auth.register('dup@example.com', 'Str0ng!Passphrase', {});
      await expect(h.auth.register('dup@example.com', 'An0ther!Passphrase', {})).resolves.toBeUndefined();
    });

    it('rejects a weak password', async () => {
      await expect(h.auth.register('weak@example.com', 'password1', {})).rejects.toBeInstanceOf(AppError);
    });

    it('activates the account after email verification', async () => {
      await h.auth.register('v@example.com', 'Str0ng!Passphrase', {});
      await h.auth.verifyEmail(tokenFromLink(h.sent.at(-1)!.link));
      const user = await h.storage.users.findByEmail('v@example.com');
      expect(user?.status).toBe('active');
      expect(user?.emailVerified).toBe(true);
    });

    it('rejects an invalid verification token', async () => {
      await expect(h.auth.verifyEmail('bogus-token-value')).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('login', () => {
    it('blocks login until the email is verified', async () => {
      await h.auth.register('p@example.com', 'Str0ng!Passphrase', {});
      await expect(h.auth.login('p@example.com', 'Str0ng!Passphrase', {})).rejects.toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
      });
    });

    it('logs in a verified user and returns tokens + roles', async () => {
      const { email, password } = await registerAndVerify(h);
      const result = await h.auth.login(email, password, {});
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.roles).toContain('user');
      expect(result.user.permissions).toContain('self:read');
    });

    it('rejects a wrong password with a generic error', async () => {
      const { email } = await registerAndVerify(h);
      await expect(h.auth.login(email, 'WrongPassword!1', {})).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('rejects an unknown account with the same generic error', async () => {
      await expect(h.auth.login('nobody@example.com', 'Whatever!123', {})).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    });
  });

  describe('refresh rotation & reuse detection', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const { email, password } = await registerAndVerify(h);
      const login = await h.auth.login(email, password, {});
      const rotated = await h.auth.refresh(login.refreshToken, {});
      expect(rotated.refreshToken).not.toBe(login.refreshToken);
      expect(rotated.accessToken).toBeTruthy();
    });

    it('detects reuse of a consumed refresh token and revokes the family', async () => {
      const { email, password } = await registerAndVerify(h);
      const login = await h.auth.login(email, password, {});
      const rotated = await h.auth.refresh(login.refreshToken, {});

      // Reusing the original (now consumed) token is rejected...
      await expect(h.auth.refresh(login.refreshToken, {})).rejects.toBeInstanceOf(AppError);
      // ...and the whole family is revoked, so the rotated token is dead too.
      await expect(h.auth.refresh(rotated.refreshToken, {})).rejects.toBeInstanceOf(AppError);
    });

    it('invalidates the refresh token on logout', async () => {
      const { email, password } = await registerAndVerify(h);
      const login = await h.auth.login(email, password, {});
      await h.auth.logout(login.refreshToken);
      await expect(h.auth.refresh(login.refreshToken, {})).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('password change & reset', () => {
    it('changes password with the correct current password and revokes sessions', async () => {
      const { email, password } = await registerAndVerify(h);
      const login = await h.auth.login(email, password, {});
      await h.auth.changePassword(login.user.id, password, 'Br@ndNewPass9');

      await expect(h.auth.refresh(login.refreshToken, {})).rejects.toBeInstanceOf(AppError);
      await expect(h.auth.login(email, 'Br@ndNewPass9', {})).resolves.toBeTruthy();
    });

    it('rejects a password change with the wrong current password', async () => {
      const { email, password } = await registerAndVerify(h);
      const login = await h.auth.login(email, password, {});
      await expect(
        h.auth.changePassword(login.user.id, 'WrongCurrent!1', 'Br@ndNewPass9'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('resets the password via a reset token and invalidates old sessions', async () => {
      const { email, password } = await registerAndVerify(h);
      const login = await h.auth.login(email, password, {});

      await h.auth.forgotPassword(email, {});
      const resetLink = h.sent.at(-1)!;
      expect(resetLink.kind).toBe('reset');
      await h.auth.resetPassword(tokenFromLink(resetLink.link), 'Reset!Password9');

      // old session dead, old password fails, new password works
      await expect(h.auth.refresh(login.refreshToken, {})).rejects.toBeInstanceOf(AppError);
      await expect(h.auth.login(email, password, {})).rejects.toBeInstanceOf(AppError);
      await expect(h.auth.login(email, 'Reset!Password9', {})).resolves.toBeTruthy();
    });

    it('does not reveal existence on forgot-password for an unknown email', async () => {
      await expect(h.auth.forgotPassword('ghost@example.com', {})).resolves.toBeUndefined();
      expect(h.sent).toHaveLength(0);
    });
  });
});
