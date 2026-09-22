import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { RbacService } from '../../core/authz/rbacService.js';
import { createRequirePermission } from '../authGuard.js';
import {
  AssignRolesBody,
  AttachPermissionsBody,
  CreatePermissionBody,
  CreateRoleBody,
  UpdateRoleBody,
} from '../schemas.js';

export interface AdminRouteDeps {
  rbac: RbacService;
  authenticate: preHandlerHookHandler;
}

const PERM_USER_READ = 'user:read';
const PERM_USER_MANAGE = 'user:manage';
const PERM_ROLE_MANAGE = 'role:manage';

function parsePaging(query: unknown): { limit: number; offset: number } {
  const q = (query ?? {}) as { limit?: string; offset?: string };
  const limit = Math.min(Math.max(Number.parseInt(q.limit ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(q.offset ?? '0', 10) || 0, 0);
  return { limit, offset };
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { rbac, authenticate } = deps;
  // Every admin route: authenticate first, then check the required permission.
  const guard = (perm: string): preHandlerHookHandler[] => [authenticate, createRequirePermission(perm)];

  // ---- Users ----
  app.get('/users', { preHandler: guard(PERM_USER_READ) }, async (request) => {
    const { limit, offset } = parsePaging(request.query);
    const { total, users } = await rbac.listUsers(limit, offset);
    return { total, limit, offset, users };
  });

  app.get('/users/:id', { preHandler: guard(PERM_USER_READ) }, async (request) => {
    const { id } = request.params as { id: string };
    return rbac.getUser(id);
  });

  app.post('/users/:id/disable', { preHandler: guard(PERM_USER_MANAGE) }, async (request) => {
    const { id } = request.params as { id: string };
    return rbac.setUserEnabled(id, false, request.user!.sub);
  });

  app.post('/users/:id/enable', { preHandler: guard(PERM_USER_MANAGE) }, async (request) => {
    const { id } = request.params as { id: string };
    return rbac.setUserEnabled(id, true, request.user!.sub);
  });

  app.post(
    '/users/:id/roles',
    { schema: { body: AssignRolesBody }, preHandler: guard(PERM_USER_MANAGE) },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as AssignRolesBody;
      return rbac.assignRolesToUser(id, body.roleIds, request.user!.sub);
    },
  );

  app.delete(
    '/users/:id/roles/:roleId',
    { preHandler: guard(PERM_USER_MANAGE) },
    async (request) => {
      const { id, roleId } = request.params as { id: string; roleId: string };
      return rbac.revokeRoleFromUser(id, roleId, request.user!.sub);
    },
  );

  // ---- Roles ----
  app.get('/roles', { preHandler: guard(PERM_ROLE_MANAGE) }, async () => {
    return { roles: await rbac.listRoles() };
  });

  app.get('/roles/:id', { preHandler: guard(PERM_ROLE_MANAGE) }, async (request) => {
    const { id } = request.params as { id: string };
    return rbac.getRoleWithPermissions(id);
  });

  app.post(
    '/roles',
    { schema: { body: CreateRoleBody }, preHandler: guard(PERM_ROLE_MANAGE) },
    async (request, reply) => {
      const body = request.body as CreateRoleBody;
      const role = await rbac.createRole(body.name, body.description ?? null, request.user!.sub);
      return reply.status(201).send(role);
    },
  );

  app.patch(
    '/roles/:id',
    { schema: { body: UpdateRoleBody }, preHandler: guard(PERM_ROLE_MANAGE) },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateRoleBody;
      return rbac.updateRole(id, body, request.user!.sub);
    },
  );

  app.delete('/roles/:id', { preHandler: guard(PERM_ROLE_MANAGE) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await rbac.deleteRole(id, request.user!.sub);
    return reply.status(204).send();
  });

  // ---- Permissions ----
  app.get('/permissions', { preHandler: guard(PERM_ROLE_MANAGE) }, async () => {
    return { permissions: await rbac.listPermissions() };
  });

  app.post(
    '/permissions',
    { schema: { body: CreatePermissionBody }, preHandler: guard(PERM_ROLE_MANAGE) },
    async (request, reply) => {
      const body = request.body as CreatePermissionBody;
      const perm = await rbac.createPermission(body.name, body.description ?? null, request.user!.sub);
      return reply.status(201).send(perm);
    },
  );

  app.post(
    '/roles/:id/permissions',
    { schema: { body: AttachPermissionsBody }, preHandler: guard(PERM_ROLE_MANAGE) },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as AttachPermissionsBody;
      const permissions = await rbac.attachPermissions(id, body.permissionIds, request.user!.sub);
      return { permissions };
    },
  );

  app.delete(
    '/roles/:id/permissions/:permId',
    { preHandler: guard(PERM_ROLE_MANAGE) },
    async (request, reply) => {
      const { id, permId } = request.params as { id: string; permId: string };
      await rbac.detachPermission(id, permId, request.user!.sub);
      return reply.status(204).send();
    },
  );
}
