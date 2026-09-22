import { SignJWT, jwtVerify } from 'jose';
import { Errors } from '../domain/errors.js';

const ISSUER = 'saim-aus';
const ALG = 'HS256';

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
  kid: string;
  accessTokenTtl: string; // e.g. "15m"
}

export interface TokenService {
  signAccessToken(input: AccessTokenInput): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessClaims>;
}

export function createTokenService(opts: TokenServiceOptions): TokenService {
  const key = new TextEncoder().encode(opts.secret);

  return {
    async signAccessToken(input: AccessTokenInput): Promise<string> {
      return new SignJWT({ roles: input.roles, perms: input.perms, permVer: input.permVer })
        .setProtectedHeader({ alg: ALG, kid: opts.kid })
        .setIssuer(ISSUER)
        .setSubject(input.userId)
        .setIssuedAt()
        .setExpirationTime(opts.accessTokenTtl)
        .sign(key);
    },

    async verifyAccessToken(token: string): Promise<AccessClaims> {
      try {
        // Pin the algorithm and issuer to defeat alg-confusion / "alg:none" (SEC-4).
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          algorithms: [ALG],
        });
        return {
          sub: String(payload.sub),
          roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
          perms: Array.isArray(payload.perms) ? (payload.perms as string[]) : [],
          permVer: typeof payload.permVer === 'number' ? payload.permVer : 0,
        };
      } catch {
        throw Errors.invalidToken();
      }
    },
  };
}
