import type {
  AuditEvent,
  EmailTokenPurpose,
  EmailTokenRecord,
  Permission,
  RefreshTokenRecord,
  Role,
  User,
  UserStatus,
} from '../core/domain/types.js';

export interface NewUser {
  email: string;
  passwordHash: string;
  status: UserStatus;
  emailVerified: boolean;
}

export type UserPatch = Partial<
  Pick<User, 'passwordHash' | 'status' | 'emailVerified' | 'lastLoginAt'>
>;

export interface UserRepo {
  create(input: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, patch: UserPatch): Promise<User>;
  list(limit: number, offset: number): Promise<User[]>;
  count(): Promise<number>;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent: string | null;
  ipHash: string | null;
}

export interface RefreshTokenRepo {
  create(input: NewRefreshToken): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  markConsumed(id: string, at: Date): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}

export interface NewEmailToken {
  userId: string;
  tokenHash: string;
  purpose: EmailTokenPurpose;
  expiresAt: Date;
}

export interface EmailTokenRepo {
  create(input: NewEmailToken): Promise<EmailTokenRecord>;
  findByHash(tokenHash: string): Promise<EmailTokenRecord | null>;
  markConsumed(id: string, at: Date): Promise<void>;
  invalidateForUser(userId: string, purpose: EmailTokenPurpose): Promise<void>;
}

export interface RoleRepo {
  // --- Auth-time resolution (used when issuing tokens) ---
  assignRoleByName(userId: string, roleName: string): Promise<void>;
  getRoleNames(userId: string): Promise<string[]>;
  getPermissionNames(userId: string): Promise<string[]>;

  // --- Role management ---
  listRoles(): Promise<Role[]>;
  getRoleById(id: string): Promise<Role | null>;
  getRoleByName(name: string): Promise<Role | null>;
  createRole(name: string, description: string | null): Promise<Role>;
  updateRole(id: string, patch: { name?: string; description?: string | null }): Promise<Role>;
  deleteRole(id: string): Promise<void>;

  // --- Permission management ---
  listPermissions(): Promise<Permission[]>;
  getPermissionById(id: string): Promise<Permission | null>;
  getPermissionByName(name: string): Promise<Permission | null>;
  createPermission(name: string, description: string | null): Promise<Permission>;
  getPermissionsForRole(roleId: string): Promise<Permission[]>;
  attachPermission(roleId: string, permissionId: string): Promise<void>;
  detachPermission(roleId: string, permissionId: string): Promise<void>;

  // --- User ↔ role assignment ---
  getRolesForUser(userId: string): Promise<Role[]>;
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  revokeRoleFromUser(userId: string, roleId: string): Promise<void>;
}

export interface AuditRepo {
  record(event: AuditEvent): Promise<void>;
}

export interface LoginAttemptRepo {
  record(identifier: string, successful: boolean, ipHash: string | null): Promise<void>;
  countRecentFailures(identifier: string, since: Date): Promise<number>;
  clearFailures(identifier: string): Promise<void>;
}

export interface Storage {
  users: UserRepo;
  refreshTokens: RefreshTokenRepo;
  emailTokens: EmailTokenRepo;
  roles: RoleRepo;
  audit: AuditRepo;
  loginAttempts: LoginAttemptRepo;
  close(): Promise<void>;
}
