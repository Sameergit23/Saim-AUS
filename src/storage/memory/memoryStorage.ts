import { randomUUID } from 'node:crypto';
import type {
  EmailTokenRecord,
  RefreshTokenRecord,
  User,
} from '../../core/domain/types.js';
import type {
  AuditRepo,
  EmailTokenRepo,
  NewEmailToken,
  NewRefreshToken,
  NewUser,
  RefreshTokenRepo,
  RoleRepo,
  Storage,
  UserPatch,
  UserRepo,
} from '../interfaces.js';

/**
 * In-memory storage for local development and tests. Not for production
 * (data is lost on restart, no cross-instance sharing). Mirrors the Postgres
 * behaviour closely enough to test the auth core end-to-end.
 */

const DEFAULT_ROLES: Record<string, string[]> = {
  admin: ['user:read', 'user:manage', 'role:manage', 'self:read', 'self:update'],
  user: ['self:read', 'self:update'],
};

export function createMemoryStorage(): Storage {
  const usersById = new Map<string, User>();
  const usersByEmail = new Map<string, string>(); // lowercased email -> id
  const refreshTokens = new Map<string, RefreshTokenRecord>();
  const emailTokens = new Map<string, EmailTokenRecord>();
  const rolePermissions = new Map<string, Set<string>>(
    Object.entries(DEFAULT_ROLES).map(([role, perms]) => [role, new Set(perms)]),
  );
  const userRoles = new Map<string, Set<string>>();

  const users: UserRepo = {
    async create(input: NewUser): Promise<User> {
      const now = new Date();
      const user: User = {
        id: randomUUID(),
        email: input.email,
        passwordHash: input.passwordHash,
        status: input.status,
        emailVerified: input.emailVerified,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      };
      usersById.set(user.id, user);
      usersByEmail.set(user.email.toLowerCase(), user.id);
      return { ...user };
    },
    async findById(id) {
      const u = usersById.get(id);
      return u ? { ...u } : null;
    },
    async findByEmail(email) {
      const id = usersByEmail.get(email.toLowerCase());
      const u = id ? usersById.get(id) : undefined;
      return u ? { ...u } : null;
    },
    async update(id, patch: UserPatch) {
      const u = usersById.get(id);
      if (!u) throw new Error(`User not found: ${id}`);
      const updated: User = { ...u, ...patch, updatedAt: new Date() };
      usersById.set(id, updated);
      return { ...updated };
    },
  };

  const refreshTokenRepo: RefreshTokenRepo = {
    async create(input: NewRefreshToken): Promise<RefreshTokenRecord> {
      const rec: RefreshTokenRecord = {
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        issuedAt: new Date(),
        expiresAt: input.expiresAt,
        consumedAt: null,
        revokedAt: null,
        userAgent: input.userAgent,
        ipHash: input.ipHash,
      };
      refreshTokens.set(rec.id, rec);
      return { ...rec };
    },
    async findByHash(tokenHash) {
      for (const rec of refreshTokens.values()) {
        if (rec.tokenHash === tokenHash) return { ...rec };
      }
      return null;
    },
    async markConsumed(id, at) {
      const rec = refreshTokens.get(id);
      if (rec) rec.consumedAt = at;
    },
    async revoke(id, at) {
      const rec = refreshTokens.get(id);
      if (rec) rec.revokedAt = at;
    },
    async revokeFamily(familyId, at) {
      for (const rec of refreshTokens.values()) {
        if (rec.familyId === familyId && !rec.revokedAt) rec.revokedAt = at;
      }
    },
    async revokeAllForUser(userId, at) {
      for (const rec of refreshTokens.values()) {
        if (rec.userId === userId && !rec.revokedAt) rec.revokedAt = at;
      }
    },
  };

  const emailTokenRepo: EmailTokenRepo = {
    async create(input: NewEmailToken): Promise<EmailTokenRecord> {
      const rec: EmailTokenRecord = {
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: new Date(),
      };
      emailTokens.set(rec.id, rec);
      return { ...rec };
    },
    async findByHash(tokenHash) {
      for (const rec of emailTokens.values()) {
        if (rec.tokenHash === tokenHash) return { ...rec };
      }
      return null;
    },
    async markConsumed(id, at) {
      const rec = emailTokens.get(id);
      if (rec) rec.consumedAt = at;
    },
    async invalidateForUser(userId, purpose) {
      const at = new Date();
      for (const rec of emailTokens.values()) {
        if (rec.userId === userId && rec.purpose === purpose && !rec.consumedAt) {
          rec.consumedAt = at;
        }
      }
    },
  };

  const roles: RoleRepo = {
    async assignRoleByName(userId, roleName) {
      if (!rolePermissions.has(roleName)) throw new Error(`Unknown role: ${roleName}`);
      const set = userRoles.get(userId) ?? new Set<string>();
      set.add(roleName);
      userRoles.set(userId, set);
    },
    async getRoleNames(userId) {
      return [...(userRoles.get(userId) ?? [])];
    },
    async getPermissionNames(userId) {
      const perms = new Set<string>();
      for (const role of userRoles.get(userId) ?? []) {
        for (const p of rolePermissions.get(role) ?? []) perms.add(p);
      }
      return [...perms];
    },
  };

  const audit: AuditRepo = {
    async record() {
      // No-op sink for in-memory mode; real audit trail lives in Postgres.
    },
  };

  return {
    users,
    refreshTokens: refreshTokenRepo,
    emailTokens: emailTokenRepo,
    roles,
    audit,
    async close() {
      /* nothing to close */
    },
  };
}
