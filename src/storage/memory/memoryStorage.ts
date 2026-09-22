import { randomUUID } from 'node:crypto';
import type {
  EmailTokenRecord,
  Permission,
  RefreshTokenRecord,
  Role,
  User,
} from '../../core/domain/types.js';
import type {
  AuditRepo,
  EmailTokenRepo,
  LoginAttemptRepo,
  NewEmailToken,
  NewRefreshToken,
  NewUser,
  RecoveryCodeRepo,
  RefreshTokenRepo,
  RoleRepo,
  Storage,
  UserPatch,
  UserRepo,
} from '../interfaces.js';

/**
 * In-memory storage for local development and tests. Not for production
 * (data is lost on restart, no cross-instance sharing). Mirrors the Postgres
 * behaviour closely enough to test the auth core and RBAC end-to-end.
 */

const DEFAULT_PERMISSIONS: Array<[string, string]> = [
  ['user:read', 'View users'],
  ['user:manage', 'Create/update/disable users'],
  ['role:manage', 'Create/update/delete roles and permissions'],
  ['self:read', 'Read own profile'],
  ['self:update', 'Update own profile'],
];

const DEFAULT_ROLES: Array<{ name: string; description: string; perms: string[] }> = [
  {
    name: 'admin',
    description: 'Full administrative access',
    perms: ['user:read', 'user:manage', 'role:manage', 'self:read', 'self:update'],
  },
  { name: 'user', description: 'Standard authenticated user', perms: ['self:read', 'self:update'] },
];

export function createMemoryStorage(): Storage {
  const usersById = new Map<string, User>();
  const usersByEmail = new Map<string, string>(); // lowercased email -> id
  const refreshTokens = new Map<string, RefreshTokenRecord>();
  const emailTokens = new Map<string, EmailTokenRecord>();

  // RBAC state (ID-based to mirror Postgres)
  const rolesById = new Map<string, Role>();
  const roleIdByName = new Map<string, string>(); // lowercased name -> id
  const permsById = new Map<string, Permission>();
  const permIdByName = new Map<string, string>(); // lowercased name -> id
  const rolePerms = new Map<string, Set<string>>(); // roleId -> Set<permissionId>
  const userRoles = new Map<string, Set<string>>(); // userId -> Set<roleId>

  // Seed default permissions & roles
  for (const [name, description] of DEFAULT_PERMISSIONS) {
    const perm: Permission = { id: randomUUID(), name, description };
    permsById.set(perm.id, perm);
    permIdByName.set(name.toLowerCase(), perm.id);
  }
  for (const def of DEFAULT_ROLES) {
    const role: Role = { id: randomUUID(), name: def.name, description: def.description, isSystem: true };
    rolesById.set(role.id, role);
    roleIdByName.set(role.name.toLowerCase(), role.id);
    rolePerms.set(role.id, new Set(def.perms.map((p) => permIdByName.get(p.toLowerCase())!)));
  }

  const users: UserRepo = {
    async create(input: NewUser): Promise<User> {
      const now = new Date();
      const user: User = {
        id: randomUUID(),
        email: input.email,
        passwordHash: input.passwordHash,
        status: input.status,
        emailVerified: input.emailVerified,
        mfaEnabled: false,
        mfaSecret: null,
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
    async list(limit, offset) {
      return [...usersById.values()]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(offset, offset + limit)
        .map((u) => ({ ...u }));
    },
    async count() {
      return usersById.size;
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
      const roleId = roleIdByName.get(roleName.toLowerCase());
      if (!roleId) throw new Error(`Unknown role: ${roleName}`);
      const set = userRoles.get(userId) ?? new Set<string>();
      set.add(roleId);
      userRoles.set(userId, set);
    },
    async getRoleNames(userId) {
      return [...(userRoles.get(userId) ?? [])].map((id) => rolesById.get(id)!.name);
    },
    async getPermissionNames(userId) {
      const perms = new Set<string>();
      for (const roleId of userRoles.get(userId) ?? []) {
        for (const permId of rolePerms.get(roleId) ?? []) {
          perms.add(permsById.get(permId)!.name);
        }
      }
      return [...perms];
    },

    async listRoles() {
      return [...rolesById.values()].map((r) => ({ ...r }));
    },
    async getRoleById(id) {
      const r = rolesById.get(id);
      return r ? { ...r } : null;
    },
    async getRoleByName(name) {
      const id = roleIdByName.get(name.toLowerCase());
      const r = id ? rolesById.get(id) : undefined;
      return r ? { ...r } : null;
    },
    async createRole(name, description) {
      const role: Role = { id: randomUUID(), name, description, isSystem: false };
      rolesById.set(role.id, role);
      roleIdByName.set(name.toLowerCase(), role.id);
      rolePerms.set(role.id, new Set());
      return { ...role };
    },
    async updateRole(id, patch) {
      const r = rolesById.get(id);
      if (!r) throw new Error(`Role not found: ${id}`);
      if (patch.name !== undefined && patch.name.toLowerCase() !== r.name.toLowerCase()) {
        roleIdByName.delete(r.name.toLowerCase());
        roleIdByName.set(patch.name.toLowerCase(), id);
        r.name = patch.name;
      }
      if (patch.description !== undefined) r.description = patch.description;
      return { ...r };
    },
    async deleteRole(id) {
      const r = rolesById.get(id);
      if (!r) return;
      rolesById.delete(id);
      roleIdByName.delete(r.name.toLowerCase());
      rolePerms.delete(id);
      for (const set of userRoles.values()) set.delete(id);
    },

    async listPermissions() {
      return [...permsById.values()].map((p) => ({ ...p }));
    },
    async getPermissionById(id) {
      const p = permsById.get(id);
      return p ? { ...p } : null;
    },
    async getPermissionByName(name) {
      const id = permIdByName.get(name.toLowerCase());
      const p = id ? permsById.get(id) : undefined;
      return p ? { ...p } : null;
    },
    async createPermission(name, description) {
      const perm: Permission = { id: randomUUID(), name, description };
      permsById.set(perm.id, perm);
      permIdByName.set(name.toLowerCase(), perm.id);
      return { ...perm };
    },
    async getPermissionsForRole(roleId) {
      return [...(rolePerms.get(roleId) ?? [])].map((pid) => ({ ...permsById.get(pid)! }));
    },
    async attachPermission(roleId, permissionId) {
      const set = rolePerms.get(roleId) ?? new Set<string>();
      set.add(permissionId);
      rolePerms.set(roleId, set);
    },
    async detachPermission(roleId, permissionId) {
      rolePerms.get(roleId)?.delete(permissionId);
    },

    async getRolesForUser(userId) {
      return [...(userRoles.get(userId) ?? [])].map((id) => ({ ...rolesById.get(id)! }));
    },
    async assignRoleToUser(userId, roleId) {
      const set = userRoles.get(userId) ?? new Set<string>();
      set.add(roleId);
      userRoles.set(userId, set);
    },
    async revokeRoleFromUser(userId, roleId) {
      userRoles.get(userId)?.delete(roleId);
    },
  };

  const audit: AuditRepo = {
    async record() {
      // No-op sink for in-memory mode; real audit trail lives in Postgres.
    },
  };

  const attempts: Array<{ identifier: string; successful: boolean; at: Date }> = [];
  const loginAttempts: LoginAttemptRepo = {
    async record(identifier, successful) {
      attempts.push({ identifier: identifier.toLowerCase(), successful, at: new Date() });
    },
    async countRecentFailures(identifier, since) {
      const id = identifier.toLowerCase();
      return attempts.filter((a) => a.identifier === id && !a.successful && a.at >= since).length;
    },
    async clearFailures(identifier) {
      const id = identifier.toLowerCase();
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i]!.identifier === id && !attempts[i]!.successful) attempts.splice(i, 1);
      }
    },
  };

  const recovery = new Map<string, Set<string>>(); // userId -> Set<codeHash> (unconsumed)
  const recoveryCodes: RecoveryCodeRepo = {
    async replaceForUser(userId, codeHashes) {
      recovery.set(userId, new Set(codeHashes));
    },
    async consume(userId, codeHash) {
      const set = recovery.get(userId);
      if (set?.has(codeHash)) {
        set.delete(codeHash);
        return true;
      }
      return false;
    },
    async deleteForUser(userId) {
      recovery.delete(userId);
    },
    async countRemaining(userId) {
      return recovery.get(userId)?.size ?? 0;
    },
  };

  return {
    users,
    refreshTokens: refreshTokenRepo,
    emailTokens: emailTokenRepo,
    roles,
    audit,
    loginAttempts,
    recoveryCodes,
    async close() {
      /* nothing to close */
    },
  };
}
