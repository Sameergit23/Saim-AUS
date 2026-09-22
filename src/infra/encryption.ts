import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets that must be
 * stored but recoverable — specifically the TOTP/MFA seed. A DB leak alone does
 * not expose usable secrets without the encryption key (which lives in config,
 * not the database).
 *
 * The 32-byte key is derived from the provided key material via SHA-256.
 */
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

export function createCipher(keyMaterial: string): Cipher {
  const key = createHash('sha256').update(keyMaterial).digest(); // 32 bytes

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      // iv.tag.ciphertext, all base64
      return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
    },

    decrypt(payload: string): string {
      const parts = payload.split('.');
      if (parts.length !== 3) throw new Error('Malformed ciphertext.');
      const [ivB64, tagB64, dataB64] = parts as [string, string, string];
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
