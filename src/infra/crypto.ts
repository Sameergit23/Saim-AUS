import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generate a cryptographically secure, URL-safe random token.
 * Used for refresh tokens and email verification/reset tokens.
 * The RAW value is returned to the caller (sent to the user); only its
 * hash is ever persisted (see hashToken).
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Hash a token for storage. We store the SHA-256 of opaque high-entropy
 * tokens (not passwords) so a DB leak never exposes usable tokens (SEC-4/SEC-12).
 * Passwords use Argon2id instead (see password service) — never this.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two hex-encoded hashes of equal length. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Hash an IP address for privacy-preserving abuse tracking (NFR-16). */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}
