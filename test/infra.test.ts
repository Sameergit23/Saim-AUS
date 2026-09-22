import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../src/infra/clock.js';
import { generateToken, hashIp, hashToken, safeEqualHex } from '../src/infra/crypto.js';
import { parseDurationToSeconds } from '../src/infra/duration.js';
import { createConsoleMailer } from '../src/infra/mailer.js';

describe('infra/crypto', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(a.length).toBeGreaterThan(20);
  });

  it('hashes tokens deterministically and differently per input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compares hashes in constant time by value', () => {
    const h = hashToken('secret');
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hashToken('other'))).toBe(false);
    expect(safeEqualHex('ab', 'abcd')).toBe(false); // different lengths
  });

  it('hashes IPs and returns null for undefined', () => {
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp('203.0.113.5')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('infra/duration', () => {
  it('parses supported units to seconds', () => {
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('7d')).toBe(604800);
  });

  it('throws on malformed durations', () => {
    expect(() => parseDurationToSeconds('15x')).toThrowError(/Invalid duration/);
    expect(() => parseDurationToSeconds('abc')).toThrowError(/Invalid duration/);
  });
});

describe('infra/clock', () => {
  it('fixedClock is stable and advanceable', () => {
    const clock = fixedClock(new Date('2026-01-01T00:00:00Z'));
    const t0 = clock.now().getTime();
    expect(clock.now().getTime()).toBe(t0);
    clock.advance(60_000);
    expect(clock.now().getTime()).toBe(t0 + 60_000);
  });
});

describe('infra/mailer', () => {
  it('console mailer logs verification and reset links', async () => {
    const log = vi.fn();
    const mailer = createConsoleMailer(log);
    await mailer.sendVerificationEmail('a@example.com', 'http://x/verify?token=1');
    await mailer.sendPasswordResetEmail('a@example.com', 'http://x/reset?token=2');
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toContain('verify');
    expect(log.mock.calls[1]![0]).toContain('reset');
  });
});
