import { randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { hashToken } from '../../infra/crypto.js';
import type { Cipher } from '../../infra/encryption.js';
import type { Storage } from '../../storage/interfaces.js';
import { Errors } from '../domain/errors.js';
import type { User } from '../domain/types.js';

const ISSUER = 'Saim-AUS';
const RECOVERY_CODE_COUNT = 10;

export interface MfaEnrollment {
  secret: string; // base32, for manual entry
  otpauthUri: string; // for QR code
}

export interface MfaService {
  beginEnrollment(userId: string): Promise<MfaEnrollment>;
  confirmEnrollment(userId: string, code: string): Promise<{ recoveryCodes: string[] }>;
  disable(userId: string, code: string): Promise<void>;
  /** Verify a TOTP code or a one-time recovery code (used during login step 2). */
  verifyCode(user: User, code: string): Promise<boolean>;
}

export interface MfaServiceDeps {
  storage: Storage;
  cipher: Cipher;
}

const normalizeRecovery = (code: string): string => code.replace(/[\s-]/g, '').toLowerCase();

function totpFor(email: string, base32Secret: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
}

function generateRecoveryCode(): string {
  const raw = randomBytes(5).toString('hex'); // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function createMfaService(deps: MfaServiceDeps): MfaService {
  const { storage, cipher } = deps;

  async function requireUser(userId: string): Promise<User> {
    const user = await storage.users.findById(userId);
    if (!user) throw Errors.unauthenticated();
    return user;
  }

  return {
    async beginEnrollment(userId) {
      const user = await requireUser(userId);
      if (user.mfaEnabled) {
        throw Errors.conflict('MFA is already enabled. Disable it before re-enrolling.');
      }
      const secret = new Secret({ size: 20 }); // 160-bit
      const totp = totpFor(user.email, secret.base32);

      // Store the encrypted secret; MFA stays disabled until a code is confirmed.
      await storage.users.update(userId, { mfaSecret: cipher.encrypt(secret.base32), mfaEnabled: false });
      return { secret: secret.base32, otpauthUri: totp.toString() };
    },

    async confirmEnrollment(userId, code) {
      const user = await requireUser(userId);
      if (!user.mfaSecret) throw Errors.validation('Start MFA enrollment first.');

      const base32 = cipher.decrypt(user.mfaSecret);
      const delta = totpFor(user.email, base32).validate({ token: code, window: 1 });
      if (delta === null) throw Errors.invalidMfaCode();

      await storage.users.update(userId, { mfaEnabled: true });

      const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
      await storage.recoveryCodes.replaceForUser(
        userId,
        codes.map((c) => hashToken(normalizeRecovery(c))),
      );
      await storage.audit.record({ actorId: userId, event: 'mfa.enabled' });
      return { recoveryCodes: codes };
    },

    async disable(userId, code) {
      const user = await requireUser(userId);
      if (!user.mfaEnabled) throw Errors.validation('MFA is not enabled.');

      const ok = await this.verifyCode(user, code);
      if (!ok) throw Errors.invalidMfaCode();

      await storage.users.update(userId, { mfaEnabled: false, mfaSecret: null });
      await storage.recoveryCodes.deleteForUser(userId);
      await storage.audit.record({ actorId: userId, event: 'mfa.disabled' });
    },

    async verifyCode(user, code) {
      if (!user.mfaEnabled || !user.mfaSecret) return false;

      const base32 = cipher.decrypt(user.mfaSecret);
      const delta = totpFor(user.email, base32).validate({ token: code, window: 1 });
      if (delta !== null) return true;

      // Fall back to a one-time recovery code.
      return storage.recoveryCodes.consume(user.id, hashToken(normalizeRecovery(code)));
    },
  };
}
