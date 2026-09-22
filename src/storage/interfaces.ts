import type {
  AuditEvent,
  EmailTokenPurpose,
  EmailTokenRecord,
  RefreshTokenRecord,
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
  assignRoleByName(userId: string, roleName: string): Promise<void>;
  getRoleNames(userId: string): Promise<string[]>;
  getPermissionNames(userId: string): Promise<string[]>;
}

export interface AuditRepo {
  record(event: AuditEvent): Promise<void>;
}

export interface Storage {
  users: UserRepo;
  refreshTokens: RefreshTokenRepo;
  emailTokens: EmailTokenRepo;
  roles: RoleRepo;
  audit: AuditRepo;
  close(): Promise<void>;
}
