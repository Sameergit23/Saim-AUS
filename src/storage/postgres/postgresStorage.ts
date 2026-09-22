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
import { createPool, type Pool } from './pool.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function mapRefresh(row: any): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    familyId: row.family_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
    ipHash: row.ip_hash,
  };
}

function mapEmailToken(row: any): EmailTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    purpose: row.purpose,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

export function createPostgresStorage(databaseUrl: string): Storage {
  const pool: Pool = createPool(databaseUrl);

  const users: UserRepo = {
    async create(input: NewUser): Promise<User> {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, status, email_verified)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.email, input.passwordHash, input.status, input.emailVerified],
      );
      return mapUser(rows[0]);
    },
    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async findByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async update(id, patch: UserPatch) {
      const set: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (patch.passwordHash !== undefined) {
        set.push(`password_hash = $${i++}`);
        values.push(patch.passwordHash);
      }
      if (patch.status !== undefined) {
        set.push(`status = $${i++}`);
        values.push(patch.status);
      }
      if (patch.emailVerified !== undefined) {
        set.push(`email_verified = $${i++}`);
        values.push(patch.emailVerified);
      }
      if (patch.lastLoginAt !== undefined) {
        set.push(`last_login_at = $${i++}`);
        values.push(patch.lastLoginAt);
      }
      set.push('updated_at = now()');
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE users SET ${set.join(', ')} WHERE id = $${i} RETURNING *`,
        values,
      );
      if (!rows[0]) throw new Error(`User not found: ${id}`);
      return mapUser(rows[0]);
    },
  };

  const refreshTokens: RefreshTokenRepo = {
    async create(input: NewRefreshToken): Promise<RefreshTokenRecord> {
      const { rows } = await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [input.userId, input.tokenHash, input.familyId, input.expiresAt, input.userAgent, input.ipHash],
      );
      return mapRefresh(rows[0]);
    },
    async findByHash(tokenHash) {
      const { rows } = await pool.query(
        'SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1',
        [tokenHash],
      );
      return rows[0] ? mapRefresh(rows[0]) : null;
    },
    async markConsumed(id, at) {
      await pool.query('UPDATE refresh_tokens SET consumed_at = $2 WHERE id = $1', [id, at]);
    },
    async revoke(id, at) {
      await pool.query('UPDATE refresh_tokens SET revoked_at = $2 WHERE id = $1', [id, at]);
    },
    async revokeFamily(familyId, at) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL',
        [familyId, at],
      );
    },
    async revokeAllForUser(userId, at) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [userId, at],
      );
    },
  };

  const emailTokens: EmailTokenRepo = {
    async create(input: NewEmailToken): Promise<EmailTokenRecord> {
      const { rows } = await pool.query(
        `INSERT INTO email_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.userId, input.tokenHash, input.purpose, input.expiresAt],
      );
      return mapEmailToken(rows[0]);
    },
    async findByHash(tokenHash) {
      const { rows } = await pool.query(
        'SELECT * FROM email_tokens WHERE token_hash = $1 LIMIT 1',
        [tokenHash],
      );
      return rows[0] ? mapEmailToken(rows[0]) : null;
    },
    async markConsumed(id, at) {
      await pool.query('UPDATE email_tokens SET consumed_at = $2 WHERE id = $1', [id, at]);
    },
    async invalidateForUser(userId, purpose) {
      await pool.query(
        `UPDATE email_tokens SET consumed_at = now()
         WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
        [userId, purpose],
      );
    },
  };

  const roles: RoleRepo = {
    async assignRoleByName(userId, roleName) {
      const { rows } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
      if (!rows[0]) throw new Error(`Unknown role: ${roleName}`);
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, rows[0].id],
      );
    },
    async getRoleNames(userId) {
      const { rows } = await pool.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
        [userId],
      );
      return rows.map((r: any) => r.name as string);
    },
    async getPermissionNames(userId) {
      const { rows } = await pool.query(
        `SELECT DISTINCT p.name FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1`,
        [userId],
      );
      return rows.map((r: any) => r.name as string);
    },
  };

  const audit: AuditRepo = {
    async record(event) {
      await pool.query(
        `INSERT INTO audit_log (actor_id, event, target_type, target_id, metadata, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.actorId,
          event.event,
          event.targetType ?? null,
          event.targetId ?? null,
          JSON.stringify(event.metadata ?? {}),
          event.ipHash ?? null,
        ],
      );
    },
  };

  return {
    users,
    refreshTokens,
    emailTokens,
    roles,
    audit,
    async close() {
      await pool.end();
    },
  };
}
