import { Algorithm, hash, verify } from '@node-rs/argon2';
import { Errors } from '../domain/errors.js';

/**
 * Password hashing (Argon2id) and policy enforcement (SEC-1, FR-13/14).
 * Parameters follow OWASP guidance (~19 MiB, 2 iterations, parallelism 1)
 * and should be revisited per deployment hardware over time.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_LENGTH = 10;
const MAX_LENGTH = 128; // bound work; Argon2 pre-hashes so this is a policy limit

// A tiny illustrative blocklist. Phase 4 adds a breached-password (k-anonymity) check.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', 'qwertyuiop', 'letmein123',
  'iloveyou1', 'admin1234', 'welcome123', 'changeme12',
]);

export interface PasswordService {
  assertStrong(password: string): void;
  hash(password: string): Promise<string>;
  verify(hashValue: string, password: string): Promise<boolean>;
}

export function createPasswordService(): PasswordService {
  return {
    assertStrong(password: string): void {
      if (typeof password !== 'string' || password.length < MIN_LENGTH) {
        throw Errors.weakPassword(`Password must be at least ${MIN_LENGTH} characters long.`);
      }
      if (password.length > MAX_LENGTH) {
        throw Errors.weakPassword(`Password must be at most ${MAX_LENGTH} characters long.`);
      }
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        throw Errors.weakPassword('This password is too common. Please choose a different one.');
      }
    },

    async hash(password: string): Promise<string> {
      return hash(password, ARGON2_OPTIONS);
    },

    async verify(hashValue: string, password: string): Promise<boolean> {
      try {
        return await verify(hashValue, password, ARGON2_OPTIONS);
      } catch {
        // A malformed stored hash should never crash auth; treat as non-match.
        return false;
      }
    },
  };
}
