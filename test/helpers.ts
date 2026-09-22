import type { Config } from '../src/config/index.js';
import { createAuthService, type AuthService } from '../src/core/authn/authService.js';
import { createPasswordService } from '../src/core/password/passwordService.js';
import { createTokenService, type TokenService } from '../src/core/tokens/tokenService.js';
import { systemClock } from '../src/infra/clock.js';
import type { Mailer } from '../src/infra/mailer.js';
import { createMemoryStorage } from '../src/storage/memory/memoryStorage.js';
import type { Storage } from '../src/storage/interfaces.js';

export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export interface SentEmail {
  to: string;
  link: string;
  kind: 'verify' | 'reset';
}

export interface TestHarness {
  storage: Storage;
  tokens: TokenService;
  auth: AuthService;
  sent: SentEmail[];
  config: Config;
}

export function buildTestHarness(): TestHarness {
  const storage = createMemoryStorage();
  const password = createPasswordService();
  const tokens = createTokenService({
    secret: TEST_SECRET,
    kid: 'test',
    accessTokenTtl: '15m',
  });

  const sent: SentEmail[] = [];
  const mailer: Mailer = {
    async sendVerificationEmail(to, link) {
      sent.push({ to, link, kind: 'verify' });
    },
    async sendPasswordResetEmail(to, link) {
      sent.push({ to, link, kind: 'reset' });
    },
  };

  const auth = createAuthService({
    storage,
    password,
    tokens,
    mailer,
    clock: systemClock,
    accessTokenTtl: '15m',
    refreshTokenTtlDays: 30,
    emailTokenTtlMinutes: 60,
    publicBaseUrl: 'http://localhost:3000',
  });

  const config: Config = {
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    storage: 'memory',
    databaseUrl: null,
    jwtSecret: TEST_SECRET,
    jwtKid: 'test',
    accessTokenTtl: '15m',
    refreshTokenTtlDays: 30,
    emailTokenTtlMinutes: 60,
    cookieSecure: false,
    cookieDomain: undefined,
    publicBaseUrl: 'http://localhost:3000',
  };

  return { storage, tokens, auth, sent, config };
}

/** Extract the opaque token from a verification/reset link. */
export function tokenFromLink(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get('token');
  if (!token) throw new Error(`No token in link: ${link}`);
  return token;
}

/** Register + verify a user so they can log in. Returns the email used. */
export async function registerAndVerify(
  harness: TestHarness,
  email = 'user@example.com',
  password = 'Str0ng!Passphrase',
): Promise<{ email: string; password: string }> {
  await harness.auth.register(email, password, {});
  const link = harness.sent.at(-1)!.link;
  await harness.auth.verifyEmail(tokenFromLink(link));
  return { email, password };
}
