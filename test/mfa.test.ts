import { Secret, TOTP } from 'otpauth';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestHarness, registerAndVerify, type TestHarness } from './helpers.js';

/** Compute the current TOTP code for a base32 secret (as an authenticator app would). */
function currentCode(base32: string): string {
  return new TOTP({ digits: 6, period: 30, algorithm: 'SHA1', secret: Secret.fromBase32(base32) }).generate();
}

function wrongCode(base32: string): string {
  return currentCode(base32) === '000000' ? '111111' : '000000';
}

describe('mfaService', () => {
  let h: TestHarness;
  let userId: string;

  beforeEach(async () => {
    h = buildTestHarness();
    await registerAndVerify(h, 'mfa@example.com', 'Str0ng!Passphrase');
    userId = (await h.storage.users.findByEmail('mfa@example.com'))!.id;
  });

  it('enrollment stays disabled until a valid code is confirmed', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    expect(enroll.secret).toBeTruthy();
    expect(enroll.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect((await h.storage.users.findById(userId))!.mfaEnabled).toBe(false);
  });

  it('does not store the TOTP secret in plaintext', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    const stored = (await h.storage.users.findById(userId))!.mfaSecret!;
    expect(stored).not.toContain(enroll.secret); // encrypted at rest
  });

  it('rejects confirmation with a wrong code', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    await expect(h.mfa.confirmEnrollment(userId, wrongCode(enroll.secret))).rejects.toMatchObject({
      code: 'INVALID_MFA_CODE',
    });
  });

  it('confirms enrollment and returns recovery codes', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    const { recoveryCodes } = await h.mfa.confirmEnrollment(userId, currentCode(enroll.secret));
    expect(recoveryCodes).toHaveLength(10);
    expect((await h.storage.users.findById(userId))!.mfaEnabled).toBe(true);
  });

  it('verifies TOTP codes and one-time recovery codes', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    const { recoveryCodes } = await h.mfa.confirmEnrollment(userId, currentCode(enroll.secret));
    const user = (await h.storage.users.findById(userId))!;

    expect(await h.mfa.verifyCode(user, currentCode(enroll.secret))).toBe(true);
    // recovery code works once...
    expect(await h.mfa.verifyCode(user, recoveryCodes[0]!)).toBe(true);
    // ...and not again
    expect(await h.mfa.verifyCode(user, recoveryCodes[0]!)).toBe(false);
  });

  it('rejects confirming before enrollment has started', async () => {
    await expect(h.mfa.confirmEnrollment(userId, '123456')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects disabling when MFA is not enabled', async () => {
    await expect(h.mfa.disable(userId, '123456')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('cannot re-enroll while already enabled', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    await h.mfa.confirmEnrollment(userId, currentCode(enroll.secret));
    await expect(h.mfa.beginEnrollment(userId)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('disables MFA with a valid code and clears the secret', async () => {
    const enroll = await h.mfa.beginEnrollment(userId);
    await h.mfa.confirmEnrollment(userId, currentCode(enroll.secret));
    await h.mfa.disable(userId, currentCode(enroll.secret));
    const user = (await h.storage.users.findById(userId))!;
    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toBeNull();
  });
});

describe('login with MFA (two-step)', () => {
  it('challenges then completes login', async () => {
    const h = buildTestHarness();
    const { email, password } = await registerAndVerify(h, 'two@example.com', 'Str0ng!Passphrase');
    const userId = (await h.storage.users.findByEmail(email))!.id;

    const enroll = await h.mfa.beginEnrollment(userId);
    await h.mfa.confirmEnrollment(userId, currentCode(enroll.secret));

    // Step 1: password login now returns a challenge, not tokens.
    const outcome = await h.auth.login(email, password, {});
    expect(outcome.mfaRequired).toBe(true);
    if (!outcome.mfaRequired) throw new Error('expected challenge');

    // Wrong code is rejected.
    await expect(
      h.auth.completeMfaLogin(outcome.mfaToken, wrongCode(enroll.secret), {}),
    ).rejects.toMatchObject({ code: 'INVALID_MFA_CODE' });

    // Step 2: the correct code completes the login.
    const result = await h.auth.completeMfaLogin(outcome.mfaToken, currentCode(enroll.secret), {});
    expect(result.accessToken).toBeTruthy();
    expect(result.user.mfaEnabled).toBe(true);
  });

  it('rejects an access token being used as an MFA challenge token', async () => {
    const h = buildTestHarness();
    const { email, password } = await registerAndVerify(h, 'mix@example.com', 'Str0ng!Passphrase');
    // Get a normal access token (no MFA)...
    const login = await h.auth.login(email, password, {});
    if (login.mfaRequired) throw new Error('unexpected challenge');
    // ...it must not be accepted as an MFA token.
    await expect(h.auth.completeMfaLogin(login.accessToken, '000000', {})).rejects.toBeTruthy();
  });
});
