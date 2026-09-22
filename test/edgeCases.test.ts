import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../src/infra/clock.js';
import { buildTestHarness, tokenFromLink, type TestHarness } from './helpers.js';

const MINUTE = 60_000;
const DAY = 86_400_000;

describe('time-based expiry (deterministic via fixed clock)', () => {
  let clock: ReturnType<typeof fixedClock>;
  let h: TestHarness;

  beforeEach(() => {
    clock = fixedClock(new Date('2026-01-01T00:00:00Z'));
    h = buildTestHarness({ clock });
  });

  it('rejects an email verification token after it expires', async () => {
    await h.auth.register('e@example.com', 'Str0ng!Passphrase', {});
    const token = tokenFromLink(h.sent.at(-1)!.link);
    clock.advance(61 * MINUTE); // TTL is 60 minutes
    await expect(h.auth.verifyEmail(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('accepts an email verification token just before expiry', async () => {
    await h.auth.register('e2@example.com', 'Str0ng!Passphrase', {});
    const token = tokenFromLink(h.sent.at(-1)!.link);
    clock.advance(59 * MINUTE);
    await expect(h.auth.verifyEmail(token)).resolves.toBeUndefined();
  });

  it('rejects a password reset token after it expires', async () => {
    await h.auth.register('r@example.com', 'Str0ng!Passphrase', {});
    await h.auth.verifyEmail(tokenFromLink(h.sent.at(-1)!.link));
    await h.auth.forgotPassword('r@example.com', {});
    const resetToken = tokenFromLink(h.sent.at(-1)!.link);
    clock.advance(61 * MINUTE);
    await expect(h.auth.resetPassword(resetToken, 'BrandNew!Pass9')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('rejects a refresh token after it expires', async () => {
    await h.auth.register('rt@example.com', 'Str0ng!Passphrase', {});
    await h.auth.verifyEmail(tokenFromLink(h.sent.at(-1)!.link));
    const login = await h.auth.login('rt@example.com', 'Str0ng!Passphrase', {});
    clock.advance(31 * DAY); // refresh TTL is 30 days
    await expect(h.auth.refresh(login.refreshToken, {})).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});

describe('injection & malformed input are treated as data, not code', () => {
  let h: TestHarness;
  beforeEach(() => {
    h = buildTestHarness();
  });

  it('treats a SQL-injection-style identifier as a literal (no bypass, no crash)', async () => {
    await expect(
      h.auth.login("' OR '1'='1' --", 'anything-here-1', {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('does not authenticate when the identifier contains control characters', async () => {
    await expect(h.auth.login('a@b.com\n\rDROP TABLE users;', 'anything-here-1', {})).rejects.toMatchObject(
      { code: 'INVALID_CREDENTIALS' },
    );
  });
});
