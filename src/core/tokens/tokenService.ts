import { SignJWT, jwtVerify } from 'jose';
import { Errors } from '../domain/errors.js';

const ISSUER = 'saim-aus';
const ALG = 'HS256';
const MFA_TTL = '5m';

export interface AccessClaims {
  sub: string;
  roles: string[];
  perms: string[];
  permVer: number;
}

export interface AccessTokenInput {
  userId: string;
  roles: string[];
  perms: string[];
  permVer: number;
}

export interface TokenServiceOptions {
  secret: string;
  /** Older secrets still accepted for verification during a key rotation (SEC-8). */
  previousSecrets?: string[];
  kid: string;
  accessTokenTtl: string; // e.g. "15m"
}

export interface TokenService {
  signAccessToken(input: AccessTokenInput): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessClaims>;
  /** Short-lived token proving password step passed, pending MFA (2-step login). */
  signMfaToken(userId: string): Promise<string>;
  verifyMfaToken(token: string): Promise<{ sub: string }>;
}

export function createTokenService(opts: TokenServiceOptions): TokenService {
  const encoder = new TextEncoder();
  const signingKey = encoder.encode(opts.secret);
  // Accept the current key plus any previous keys, so tokens issued just before
  // a key rotation stay valid until they expire (no forced mass logout).
  const verifyKeys = [signingKey, ...(opts.previousSecrets ?? []).map((s) => encoder.encode(s))];

  async function verifyWithAnyKey(token: string): Promise<Record<string, unknown>> {
    for (const key of verifyKeys) {
      try {
        // Pin the algorithm and issuer to defeat alg-confusion / "alg:none" (SEC-4).
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: [ALG] });
        return payload;
      } catch {
        // Try the next key (rotation) before giving up.
      }
    }
    throw Errors.invalidToken();
  }

  return {
    async signAccessToken(input: AccessTokenInput): Promise<string> {
      return new SignJWT({
        typ: 'access',
        roles: input.roles,
        perms: input.perms,
        permVer: input.permVer,
      })
        .setProtectedHeader({ alg: ALG, kid: opts.kid })
        .setIssuer(ISSUER)
        .setSubject(input.userId)
        .setIssuedAt()
        .setExpirationTime(opts.accessTokenTtl)
        .sign(signingKey);
    },

    async verifyAccessToken(token: string): Promise<AccessClaims> {
      const payload = await verifyWithAnyKey(token);
      // An MFA challenge token must never be usable as an access token.
      if (payload.typ === 'mfa') throw Errors.invalidToken();
      return {
        sub: String(payload.sub),
        roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
        perms: Array.isArray(payload.perms) ? (payload.perms as string[]) : [],
        permVer: typeof payload.permVer === 'number' ? payload.permVer : 0,
      };
    },

    async signMfaToken(userId: string): Promise<string> {
      return new SignJWT({ typ: 'mfa' })
        .setProtectedHeader({ alg: ALG, kid: opts.kid })
        .setIssuer(ISSUER)
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(MFA_TTL)
        .sign(signingKey);
    },

    async verifyMfaToken(token: string): Promise<{ sub: string }> {
      const payload = await verifyWithAnyKey(token);
      if (payload.typ !== 'mfa') throw Errors.invalidToken();
      return { sub: String(payload.sub) };
    },
  };
}
