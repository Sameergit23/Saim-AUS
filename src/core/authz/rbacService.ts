import type { Clock } from '../../infra/clock.js';
import type { Storage } from '../../storage/interfaces.js';
import { Errors } from '../domain/errors.js';
import type { AdminUserView, Permission, Role, User } from '../domain/types.js';

/**
 * Administrative RBAC operations: manage users, roles, permissions, and
 * role assignments. Every mutating operation is authorized upstream by a
 * permission guard and recorded in the audit log (SEC-9, SEC-10).
 *
 * Note: because access tokens carry a permission snapshot, role/permission
 * changes take effect for a user on their next token refresh (within the
 * access-token TTL), not instantly on already-issued tokens.
 */
export interface RbacServiceDeps {
  storage: Storage;
  clock: Clock;
}

export interface RbacService {
  listUsers(limit: number, offset: number): Promise<{ total: number; users: AdminUserView[] }>;
  getUser(id: string): Promise<AdminUserView>;
  setUserEnabled(id: string, enabled: boolean, actorId: string): Promise<AdminUserView>;

  listRoles(): Promise<Role[]>;
  getRoleWithPermissions(id: string): Promise<{ role: Role; permissions: Permission[] }>;
  createRole(name: string, description: string | null, actorId: string): Promise<Role>;
  updateRole(
    id: string,
    patch: { name?: string; description?: string | null },
    actorId: string,
  ): Promise<Role>;
  deleteRole(id: string, actorId: string): Promise<void>;

  listPermissions(): Promise<Permission[]>;
  createPermission(name: string, description: string | null, actorId: string): Promise<Permission>;
  attachPermissions(roleId: string, permissionIds: string[], actorId: string): Promise<Permission[]>;
  detachPermission(roleId: string, permissionId: string, actorId: string): Promise<void>;

  assignRolesToUser(userId: string, roleIds: string[], actorId: string): Promise<AdminUserView>;
  revokeRoleFromUser(userId: string, roleId: string, actorId: string): Promise<AdminUserView>;
}

export function createRbacService(deps: RbacServiceDeps): RbacService {
  const { storage, clock } = deps;

  async function toAdminView(user: User): Promise<AdminUserView> {
    const roles = await storage.roles.getRoleNames(user.id);
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      roles,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async function requireUser(id: string): Promise<User> {
    const user = await storage.users.findById(id);
    if (!user) throw Errors.notFound('User not found.');
    return user;
  }

  async function requireRole(id: string): Promise<Role> {
    const role = await storage.roles.getRoleById(id);
    if (!role) throw Errors.notFound('Role not found.');
    return role;
  }

  return {
    async listUsers(limit, offset) {
      const [users, total] = await Promise.all([
        storage.users.list(limit, offset),
        storage.users.count(),
      ]);
      const views = await Promise.all(users.map((u) => toAdminView(u)));
      return { total, users: views };
    },

    async getUser(id) {
      return toAdminView(await requireUser(id));
    },

    async setUserEnabled(id, enabled, actorId) {
      await requireUser(id);
      const status = enabled ? 'active' : 'disabled';
      const updated = await storage.users.update(id, { status });
      if (!enabled) {
        // Disabling an account terminates its active sessions immediately.
        await storage.refreshTokens.revokeAllForUser(id, clock.now());
      }
      await storage.audit.record({
        actorId,
        event: enabled ? 'user.enabled' : 'user.disabled',
        targetType: 'user',
        targetId: id,
      });
      return toAdminView(updated);
    },

    async listRoles() {
      return storage.roles.listRoles();
    },

    async getRoleWithPermissions(id) {
      const role = await requireRole(id);
      const permissions = await storage.roles.getPermissionsForRole(id);
      return { role, permissions };
    },

    async createRole(name, description, actorId) {
      if (await storage.roles.getRoleByName(name)) {
        throw Errors.conflict(`A role named "${name}" already exists.`);
      }
      const role = await storage.roles.createRole(name, description);
      await storage.audit.record({
        actorId,
        event: 'role.created',
        targetType: 'role',
        targetId: role.id,
        metadata: { name },
      });
      return role;
    },

    async updateRole(id, patch, actorId) {
      const role = await requireRole(id);
      if (patch.name !== undefined && patch.name.toLowerCase() !== role.name.toLowerCase()) {
        if (role.isSystem) throw Errors.forbidden('System roles cannot be renamed.');
        const clash = await storage.roles.getRoleByName(patch.name);
        if (clash && clash.id !== id) {
          throw Errors.conflict(`A role named "${patch.name}" already exists.`);
        }
      }
      const updated = await storage.roles.updateRole(id, patch);
      await storage.audit.record({
        actorId,
        event: 'role.updated',
        targetType: 'role',
        targetId: id,
      });
      return updated;
    },

    async deleteRole(id, actorId) {
      const role = await requireRole(id);
      if (role.isSystem) throw Errors.forbidden('System roles cannot be deleted.');
      await storage.roles.deleteRole(id);
      await storage.audit.record({
        actorId,
        event: 'role.deleted',
        targetType: 'role',
        targetId: id,
        metadata: { name: role.name },
      });
    },

    async listPermissions() {
      return storage.roles.listPermissions();
    },

    async createPermission(name, description, actorId) {
      if (await storage.roles.getPermissionByName(name)) {
        throw Errors.conflict(`A permission named "${name}" already exists.`);
      }
      const permission = await storage.roles.createPermission(name, description);
      await storage.audit.record({
        actorId,
        event: 'permission.created',
        targetType: 'permission',
        targetId: permission.id,
        metadata: { name },
      });
      return permission;
    },

    async attachPermissions(roleId, permissionIds, actorId) {
      await requireRole(roleId);
      for (const permissionId of permissionIds) {
        const perm = await storage.roles.getPermissionById(permissionId);
        if (!perm) throw Errors.notFound(`Permission not found: ${permissionId}`);
        await storage.roles.attachPermission(roleId, permissionId);
      }
      await storage.audit.record({
        actorId,
        event: 'role.permissions_attached',
        targetType: 'role',
        targetId: roleId,
        metadata: { permissionIds },
      });
      return storage.roles.getPermissionsForRole(roleId);
    },

    async detachPermission(roleId, permissionId, actorId) {
      await requireRole(roleId);
      await storage.roles.detachPermission(roleId, permissionId);
      await storage.audit.record({
        actorId,
        event: 'role.permission_detached',
        targetType: 'role',
        targetId: roleId,
        metadata: { permissionId },
      });
    },

    async assignRolesToUser(userId, roleIds, actorId) {
      await requireUser(userId);
      for (const roleId of roleIds) {
        await requireRole(roleId);
        await storage.roles.assignRoleToUser(userId, roleId);
      }
      await storage.audit.record({
        actorId,
        event: 'user.roles_assigned',
        targetType: 'user',
        targetId: userId,
        metadata: { roleIds },
      });
      return toAdminView(await requireUser(userId));
    },

    async revokeRoleFromUser(userId, roleId, actorId) {
      await requireUser(userId);
      await storage.roles.revokeRoleFromUser(userId, roleId);
      await storage.audit.record({
        actorId,
        event: 'user.role_revoked',
        targetType: 'user',
        targetId: userId,
        metadata: { roleId },
      });
      return toAdminView(await requireUser(userId));
    },
  };
}
