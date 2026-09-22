import { describe, expect, it } from 'vitest';
import { AppError } from '../src/core/domain/errors.js';
import { createPasswordService } from '../src/core/password/passwordService.js';

describe('passwordService', () => {
  const svc = createPasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await svc.hash('Str0ng!Passphrase');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await svc.verify(hash, 'Str0ng!Passphrase')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await svc.hash('Str0ng!Passphrase');
    expect(await svc.verify(hash, 'wrong-password')).toBe(false);
  });

  it('never returns the plaintext in the hash', async () => {
    const hash = await svc.hash('Str0ng!Passphrase');
    expect(hash).not.toContain('Str0ng!Passphrase');
  });

  it('produces distinct hashes for the same password (unique salt)', async () => {
    const a = await svc.hash('Str0ng!Passphrase');
    const b = await svc.hash('Str0ng!Passphrase');
    expect(a).not.toBe(b);
  });

  it('rejects passwords that are too short', () => {
    expect(() => svc.assertStrong('short')).toThrowError(AppError);
  });

  it('rejects common passwords', () => {
    expect(() => svc.assertStrong('welcome123')).toThrowError(/too common/);
  });

  it('accepts a sufficiently strong password', () => {
    expect(() => svc.assertStrong('Str0ng!Passphrase')).not.toThrow();
  });

  it('does not crash on a malformed stored hash', async () => {
    expect(await svc.verify('not-a-valid-hash', 'whatever')).toBe(false);
  });
});
