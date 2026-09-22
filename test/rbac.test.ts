import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestHarness, registerAndVerify, type TestHarness } from './helpers.js';

const ACTOR = 'admin-actor-id';

describe('rbacService', () => {
  let h: TestHarness;
  beforeEach(() => {
    h = buildTestHarness();
  });

  async function makeUser(email = 'member@example.com'): Promise<string> {
    await registerAndVerify(h, email, 'Member!Passphrase9');
    return (await h.storage.users.findByEmail(email))!.id;
  }

  describe('roles', () => {
    it('creates and lists a custom role', async () => {
      const role = await h.rbac.createRole('editor', 'Can edit content', ACTOR);
      expect(role.id).toBeTruthy();
      expect(role.isSystem).toBe(false);
      const names = (await h.rbac.listRoles()).map((r) => r.name);
      expect(names).toContain('editor');
      expect(names).toContain('admin');
    });

    it('rejects a duplicate role name', async () => {
      await h.rbac.createRole('editor', null, ACTOR);
      await expect(h.rbac.createRole('editor', null, ACTOR)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('refuses to delete a system role', async () => {
      const admin = (await h.rbac.listRoles()).find((r) => r.name === 'admin')!;
      await expect(h.rbac.deleteRole(admin.id, ACTOR)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refuses to rename a system role', async () => {
      const admin = (await h.rbac.listRoles()).find((r) => r.name === 'admin')!;
      await expect(h.rbac.updateRole(admin.id, { name: 'superadmin' }, ACTOR)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('deletes a custom role', async () => {
      const role = await h.rbac.createRole('temp', null, ACTOR);
      await h.rbac.deleteRole(role.id, ACTOR);
      expect((await h.rbac.listRoles()).map((r) => r.name)).not.toContain('temp');
    });
  });

  describe('permissions', () => {
    it('creates a permission and attaches it to a role', async () => {
      const role = await h.rbac.createRole('editor', null, ACTOR);
      const perm = await h.rbac.createPermission('post:write', 'Write posts', ACTOR);
      const perms = await h.rbac.attachPermissions(role.id, [perm.id], ACTOR);
      expect(perms.map((p) => p.name)).toContain('post:write');
    });

    it('rejects attaching an unknown permission', async () => {
      const role = await h.rbac.createRole('editor', null, ACTOR);
      await expect(h.rbac.attachPermissions(role.id, ['does-not-exist'], ACTOR)).rejects.toMatchObject(
        { code: 'NOT_FOUND' },
      );
    });

    it('detaches a permission from a role', async () => {
      const role = await h.rbac.createRole('editor', null, ACTOR);
      const perm = await h.rbac.createPermission('post:write', null, ACTOR);
      await h.rbac.attachPermissions(role.id, [perm.id], ACTOR);
      await h.rbac.detachPermission(role.id, perm.id, ACTOR);
      const { permissions } = await h.rbac.getRoleWithPermissions(role.id);
      expect(permissions.map((p) => p.name)).not.toContain('post:write');
    });
  });

  describe('user role assignment', () => {
    it('assigns a role and reflects it in the user\'s effective permissions', async () => {
      const userId = await makeUser();
      const role = await h.rbac.createRole('editor', null, ACTOR);
      const perm = await h.rbac.createPermission('post:write', null, ACTOR);
      await h.rbac.attachPermissions(role.id, [perm.id], ACTOR);

      await h.rbac.assignRolesToUser(userId, [role.id], ACTOR);

      expect(await h.storage.roles.getRoleNames(userId)).toContain('editor');
      expect(await h.storage.roles.getPermissionNames(userId)).toContain('post:write');
    });

    it('revokes a role from a user', async () => {
      const userId = await makeUser();
      const role = await h.rbac.createRole('editor', null, ACTOR);
      await h.rbac.assignRolesToUser(userId, [role.id], ACTOR);
      await h.rbac.revokeRoleFromUser(userId, role.id, ACTOR);
      expect(await h.storage.roles.getRoleNames(userId)).not.toContain('editor');
    });

    it('rejects assigning a role to an unknown user', async () => {
      const role = await h.rbac.createRole('editor', null, ACTOR);
      await expect(h.rbac.assignRolesToUser('ghost', [role.id], ACTOR)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('user administration', () => {
    it('lists users with a total count', async () => {
      await makeUser('a@example.com');
      await makeUser('b@example.com');
      const { total, users } = await h.rbac.listUsers(50, 0);
      expect(total).toBe(2);
      expect(users).toHaveLength(2);
    });

    it('disables a user and revokes their sessions', async () => {
      const email = 'victim@example.com';
      await registerAndVerify(h, email, 'Victim!Passphrase9');
      const login = await h.auth.login(email, 'Victim!Passphrase9', {});
      const userId = login.user.id;

      await h.rbac.setUserEnabled(userId, false, ACTOR);

      const user = await h.storage.users.findById(userId);
      expect(user?.status).toBe('disabled');
      // sessions revoked -> refresh fails
      await expect(h.auth.refresh(login.refreshToken, {})).rejects.toBeTruthy();
    });

    it('throws NOT_FOUND for an unknown user', async () => {
      await expect(h.rbac.getUser('ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('re-enables a disabled user', async () => {
      const userId = await makeUser('reenable@example.com');
      await h.rbac.setUserEnabled(userId, false, ACTOR);
      const view = await h.rbac.setUserEnabled(userId, true, ACTOR);
      expect(view.status).toBe('active');
    });
  });

  describe('error paths', () => {
    it('rejects updating a non-existent role', async () => {
      await expect(h.rbac.updateRole('ghost', { description: 'x' }, ACTOR)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects renaming a role onto an existing name', async () => {
      const a = await h.rbac.createRole('alpha', null, ACTOR);
      await h.rbac.createRole('beta', null, ACTOR);
      await expect(h.rbac.updateRole(a.id, { name: 'beta' }, ACTOR)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('rejects deleting a non-existent role', async () => {
      await expect(h.rbac.deleteRole('ghost', ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects a duplicate permission name', async () => {
      await h.rbac.createPermission('post:write', null, ACTOR);
      await expect(h.rbac.createPermission('post:write', null, ACTOR)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('rejects attaching permissions to a non-existent role', async () => {
      await expect(h.rbac.attachPermissions('ghost', [], ACTOR)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects detaching from a non-existent role', async () => {
      await expect(h.rbac.detachPermission('ghost', 'p', ACTOR)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects revoking a role from a non-existent user', async () => {
      await expect(h.rbac.revokeRoleFromUser('ghost', 'r', ACTOR)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects fetching permissions for a non-existent role', async () => {
      await expect(h.rbac.getRoleWithPermissions('ghost')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('updates a custom role description', async () => {
      const role = await h.rbac.createRole('editor', 'old', ACTOR);
      const updated = await h.rbac.updateRole(role.id, { description: 'new' }, ACTOR);
      expect(updated.description).toBe('new');
    });
  });
});
