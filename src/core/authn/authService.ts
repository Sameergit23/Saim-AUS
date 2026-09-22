import { randomUUID } from 'node:crypto';
import type { Clock } from '../../infra/clock.js';
import { generateToken, hashIp, hashToken } from '../../infra/crypto.js';
import { parseDurationToSeconds } from '../../infra/duration.js';
import type { Mailer } from '../../infra/mailer.js';
import type { Storage } from '../../storage/interfaces.js';
import { Errors } from '../domain/errors.js';
import { toPublicUser, type PublicUser } from '../domain/types.js';
import type { PasswordService } from '../password/passwordService.js';
import type { TokenService } from '../tokens/tokenService.js';

const DEFAULT_ROLE = 'user';

export interface AuthServiceDeps {
  storage: Storage;
  password: PasswordService;
  tokens: TokenService;
  mailer: Mailer;
  clock: Clock;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  emailTokenTtlMinutes: number;
  publicBaseUrl: string;
}

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult extends SessionTokens {
  user: PublicUser;
}

export interface AuthService {
  register(email: string, password: string, ctx: RequestContext): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  login(email: string, password: string, ctx: RequestContext): Promise<LoginResult>;
  refresh(refreshToken: string, ctx: RequestContext): Promise<SessionTokens>;
  logout(refreshToken: string): Promise<void>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  forgotPassword(email: string, ctx: RequestContext): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  getProfile(userId: string): Promise<PublicUser>;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { storage, password, tokens, mailer, clock } = deps;
  const accessTtlSeconds = parseDurationToSeconds(deps.accessTokenTtl);

  async function issueSession(userId: string, ctx: RequestContext, familyId: string): Promise<SessionTokens> {
    const [roles, perms] = await Promise.all([
      storage.roles.getRoleNames(userId),
      storage.roles.getPermissionNames(userId),
    ]);

    const accessToken = await tokens.signAccessToken({ userId, roles, perms, permVer: 1 });

    const rawRefresh = generateToken();
    const expiresAt = new Date(clock.now().getTime() + deps.refreshTokenTtlDays * 86400_000);
    await storage.refreshTokens.create({
      userId,
      tokenHash: hashToken(rawRefresh),
      familyId,
      expiresAt,
      userAgent: ctx.userAgent ?? null,
      ipHash: hashIp(ctx.ip),
    });

    return { accessToken, refreshToken: rawRefresh, expiresIn: accessTtlSeconds };
  }

  return {
    async register(emailRaw, passwordRaw, ctx) {
      const email = normalizeEmail(emailRaw);
      // Validate password strength first (independent of whether the email exists).
      password.assertStrong(passwordRaw);

      // No user enumeration: if the email is taken, respond as if it succeeded.
      const existing = await storage.users.findByEmail(email);
      if (existing) return;

      const passwordHash = await password.hash(passwordRaw);
      const user = await storage.users.create({
        email,
        passwordHash,
        status: 'pending',
        emailVerified: false,
      });
      await storage.roles.assignRoleByName(user.id, DEFAULT_ROLE);

      const rawToken = generateToken();
      const expiresAt = new Date(clock.now().getTime() + deps.emailTokenTtlMinutes * 60_000);
      await storage.emailTokens.create({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        purpose: 'verify_email',
        expiresAt,
      });

      const link = `${deps.publicBaseUrl}/verify-email?token=${rawToken}`;
      await mailer.sendVerificationEmail(email, link);
      await storage.audit.record({ actorId: user.id, event: 'user.registered', ipHash: hashIp(ctx.ip) });
    },

    async verifyEmail(token) {
      const rec = await storage.emailTokens.findByHash(hashToken(token));
      const now = clock.now();
      if (!rec || rec.purpose !== 'verify_email' || rec.consumedAt || rec.expiresAt <= now) {
        throw Errors.invalidToken();
      }
      await storage.emailTokens.markConsumed(rec.id, now);
      await storage.users.update(rec.userId, { emailVerified: true, status: 'active' });
      await storage.audit.record({ actorId: rec.userId, event: 'user.email_verified' });
    },

    async login(emailRaw, passwordRaw, ctx) {
      const email = normalizeEmail(emailRaw);
      const user = await storage.users.findByEmail(email);

      // Always run a hash verification to keep timing uniform (mitigate enumeration).
      const hashToCheck = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$notarealsalt$notarealhash';
      const ok = await password.verify(hashToCheck, passwordRaw);

      if (!user || !ok) {
        await storage.audit.record({
          actorId: user?.id ?? null,
          event: 'auth.login_failed',
          ipHash: hashIp(ctx.ip),
        });
        throw Errors.invalidCredentials();
      }
      if (user.status === 'disabled') throw Errors.accountDisabled();
      if (!user.emailVerified || user.status === 'pending') throw Errors.emailNotVerified();

      await storage.users.update(user.id, { lastLoginAt: clock.now() });
      const session = await issueSession(user.id, ctx, randomUUID());
      const [roles, perms] = await Promise.all([
        storage.roles.getRoleNames(user.id),
        storage.roles.getPermissionNames(user.id),
      ]);
      await storage.audit.record({
        actorId: user.id,
        event: 'auth.login_success',
        ipHash: hashIp(ctx.ip),
      });
      return { ...session, user: toPublicUser(user, roles, perms) };
    },

    async refresh(refreshToken, ctx) {
      const now = clock.now();
      const rec = await storage.refreshTokens.findByHash(hashToken(refreshToken));
      if (!rec) throw Errors.invalidToken();

      // Reuse detection: a consumed or revoked token being presented again means
      // the token may have been stolen — revoke the whole family (SEC-4).
      if (rec.consumedAt || rec.revokedAt) {
        await storage.refreshTokens.revokeFamily(rec.familyId, now);
        throw Errors.invalidToken();
      }
      if (rec.expiresAt <= now) throw Errors.invalidToken();

      const user = await storage.users.findById(rec.userId);
      if (!user || user.status === 'disabled') {
        await storage.refreshTokens.revokeFamily(rec.familyId, now);
        throw Errors.invalidToken();
      }

      // Rotate: consume the presented token, issue a new one in the same family.
      await storage.refreshTokens.markConsumed(rec.id, now);
      return issueSession(user.id, ctx, rec.familyId);
    },

    async logout(refreshToken) {
      const rec = await storage.refreshTokens.findByHash(hashToken(refreshToken));
      if (rec && !rec.revokedAt) {
        await storage.refreshTokens.revoke(rec.id, clock.now());
      }
    },

    async changePassword(userId, currentPassword, newPassword) {
      const user = await storage.users.findById(userId);
      if (!user) throw Errors.unauthenticated();

      const ok = await password.verify(user.passwordHash, currentPassword);
      if (!ok) throw Errors.invalidCredentials();

      password.assertStrong(newPassword);
      const passwordHash = await password.hash(newPassword);
      await storage.users.update(userId, { passwordHash });
      // Invalidate all existing sessions on password change (FR-17).
      await storage.refreshTokens.revokeAllForUser(userId, clock.now());
      await storage.audit.record({ actorId: userId, event: 'auth.password_changed' });
    },

    async forgotPassword(emailRaw, ctx) {
      const email = normalizeEmail(emailRaw);
      const user = await storage.users.findByEmail(email);
      // Generic response regardless of existence (no enumeration).
      if (!user) return;

      await storage.emailTokens.invalidateForUser(user.id, 'password_reset');
      const rawToken = generateToken();
      const expiresAt = new Date(clock.now().getTime() + deps.emailTokenTtlMinutes * 60_000);
      await storage.emailTokens.create({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        purpose: 'password_reset',
        expiresAt,
      });
      const link = `${deps.publicBaseUrl}/reset-password?token=${rawToken}`;
      await mailer.sendPasswordResetEmail(email, link);
      await storage.audit.record({
        actorId: user.id,
        event: 'auth.password_reset_requested',
        ipHash: hashIp(ctx.ip),
      });
    },

    async resetPassword(token, newPassword) {
      const rec = await storage.emailTokens.findByHash(hashToken(token));
      const now = clock.now();
      if (!rec || rec.purpose !== 'password_reset' || rec.consumedAt || rec.expiresAt <= now) {
        throw Errors.invalidToken();
      }
      password.assertStrong(newPassword);
      const passwordHash = await password.hash(newPassword);
      await storage.emailTokens.markConsumed(rec.id, now);
      await storage.users.update(rec.userId, { passwordHash, status: 'active', emailVerified: true });
      await storage.refreshTokens.revokeAllForUser(rec.userId, now);
      await storage.audit.record({ actorId: rec.userId, event: 'auth.password_reset' });
    },

    async getProfile(userId) {
      const user = await storage.users.findById(userId);
      if (!user) throw Errors.unauthenticated();
      const [roles, perms] = await Promise.all([
        storage.roles.getRoleNames(userId),
        storage.roles.getPermissionNames(userId),
      ]);
      return toPublicUser(user, roles, perms);
    },
  };
}
