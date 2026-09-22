import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import {
  buildTestHarness,
  registerAdmin,
  registerAndVerify,
  type TestHarness,
} from './helpers.js';

describe('Admin API (RBAC enforcement)', () => {
  let h: TestHarness;
  let app: FastifyInstance;

  beforeEach(async () => {
    h = buildTestHarness();
    app = await buildServer({
      config: h.config,
      auth: h.auth,
      rbac: h.rbac,
      tokens: h.tokens,
      logger: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const loginToken = async (email: string, password: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return res.json().accessToken as string;
  };

  async function adminToken(): Promise<string> {
    const { email, password } = await registerAdmin(h);
    return loginToken(email, password);
  }

  const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

  describe('guard enforcement', () => {
    it('rejects unauthenticated access with 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a non-admin user with 403 (deny-by-default)', async () => {
      const { email, password } = await registerAndVerify(h, 'plain@example.com', 'Plain!Passphrase9');
      const token = await loginToken(email, password);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('allows an admin to list users', async () => {
      const token = await adminToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('role & permission management', () => {
    it('creates a role, a permission, and attaches them', async () => {
      const token = await adminToken();

      const roleRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: authHeader(token),
        payload: { name: 'editor', description: 'Edits content' },
      });
      expect(roleRes.statusCode).toBe(201);
      const roleId = roleRes.json().id as string;

      const permRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/permissions',
        headers: authHeader(token),
        payload: { name: 'post:write' },
      });
      expect(permRes.statusCode).toBe(201);
      const permId = permRes.json().id as string;

      const attachRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/roles/${roleId}/permissions`,
        headers: authHeader(token),
        payload: { permissionIds: [permId] },
      });
      expect(attachRes.statusCode).toBe(200);
      expect(attachRes.json().permissions.map((p: { name: string }) => p.name)).toContain('post:write');
    });

    it('refuses to delete a system role via the API', async () => {
      const token = await adminToken();
      const rolesRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/roles',
        headers: authHeader(token),
      });
      const adminRole = rolesRes.json().roles.find((r: { name: string }) => r.name === 'admin');
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/roles/${adminRole.id}`,
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects a malformed permission name at the schema boundary', async () => {
      const token = await adminToken();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/permissions',
        headers: authHeader(token),
        payload: { name: 'has spaces!' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('assigning roles grants new permissions on next login', () => {
    it('promotes a user by assigning a role with new permissions', async () => {
      const token = await adminToken();

      // A plain member with only self:* permissions
      await registerAndVerify(h, 'member@example.com', 'Member!Passphrase9');
      const memberId = (await h.storage.users.findByEmail('member@example.com'))!.id;

      // Create an editor role with post:write and assign it
      const roleRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: authHeader(token),
        payload: { name: 'editor' },
      });
      const roleId = roleRes.json().id as string;
      const permRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/permissions',
        headers: authHeader(token),
        payload: { name: 'post:write' },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/roles/${roleId}/permissions`,
        headers: authHeader(token),
        payload: { permissionIds: [permRes.json().id] },
      });
      const assignRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${memberId}/roles`,
        headers: authHeader(token),
        payload: { roleIds: [roleId] },
      });
      expect(assignRes.statusCode).toBe(200);
      expect(assignRes.json().roles).toContain('editor');

      // On the member's next login, the token carries the new permission
      const memberToken = await loginToken('member@example.com', 'Member!Passphrase9');
      const me = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: authHeader(memberToken),
      });
      expect(me.json().permissions).toContain('post:write');
    });
  });

  describe('disabling a user', () => {
    it('blocks a disabled user from logging in again', async () => {
      const token = await adminToken();
      await registerAndVerify(h, 'target@example.com', 'Target!Passphrase9');
      const targetId = (await h.storage.users.findByEmail('target@example.com'))!.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${targetId}/disable`,
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('disabled');

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'target@example.com', password: 'Target!Passphrase9' },
      });
      expect(login.statusCode).toBe(403);
      expect(login.json().error.code).toBe('ACCOUNT_DISABLED');
    });
  });
});
