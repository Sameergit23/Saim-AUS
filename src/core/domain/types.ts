/** Core domain entities. Pure data — no framework or storage concerns. */

export type UserStatus = 'pending' | 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/** Public-facing view of a user (never exposes the password hash). */
export interface PublicUser {
  id: string;
  email: string;
  status: UserStatus;
  emailVerified: boolean;
  roles: string[];
  permissions: string[];
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  userAgent: string | null;
  ipHash: string | null;
}

export type EmailTokenPurpose = 'verify_email' | 'password_reset';

export interface EmailTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: EmailTokenPurpose;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface AuditEvent {
  actorId: string | null;
  event: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
}

export function toPublicUser(user: User, roles: string[], permissions: string[]): PublicUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    emailVerified: user.emailVerified,
    roles,
    permissions,
  };
}
