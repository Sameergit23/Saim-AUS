import { Type, type Static } from '@sinclair/typebox';

// Email validated by pattern (portable across AJV configs); the service also normalizes.
const Email = Type.String({
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  maxLength: 254,
});
const Password = Type.String({ minLength: 8, maxLength: 128 });
const OpaqueToken = Type.String({ minLength: 16, maxLength: 512 });

export const RegisterBody = Type.Object({ email: Email, password: Password }, { additionalProperties: false });
export type RegisterBody = Static<typeof RegisterBody>;

export const LoginBody = Type.Object({ email: Email, password: Password }, { additionalProperties: false });
export type LoginBody = Static<typeof LoginBody>;

export const VerifyEmailBody = Type.Object({ token: OpaqueToken }, { additionalProperties: false });
export type VerifyEmailBody = Static<typeof VerifyEmailBody>;

export const RefreshBody = Type.Object(
  { refreshToken: Type.Optional(OpaqueToken) },
  { additionalProperties: false },
);
export type RefreshBody = Static<typeof RefreshBody>;

export const ForgotPasswordBody = Type.Object({ email: Email }, { additionalProperties: false });
export type ForgotPasswordBody = Static<typeof ForgotPasswordBody>;

export const ResetPasswordBody = Type.Object(
  { token: OpaqueToken, newPassword: Password },
  { additionalProperties: false },
);
export type ResetPasswordBody = Static<typeof ResetPasswordBody>;

export const ChangePasswordBody = Type.Object(
  { currentPassword: Password, newPassword: Password },
  { additionalProperties: false },
);
export type ChangePasswordBody = Static<typeof ChangePasswordBody>;

// ---- Admin / RBAC schemas ----
const Name = Type.String({ pattern: '^[a-zA-Z0-9_:.-]{2,64}$' });
const Description = Type.Optional(Type.String({ maxLength: 256 }));
const Id = Type.String({ minLength: 8, maxLength: 64 });

export const CreateRoleBody = Type.Object(
  { name: Name, description: Description },
  { additionalProperties: false },
);
export type CreateRoleBody = Static<typeof CreateRoleBody>;

export const UpdateRoleBody = Type.Object(
  { name: Type.Optional(Name), description: Description },
  { additionalProperties: false },
);
export type UpdateRoleBody = Static<typeof UpdateRoleBody>;

export const CreatePermissionBody = Type.Object(
  { name: Name, description: Description },
  { additionalProperties: false },
);
export type CreatePermissionBody = Static<typeof CreatePermissionBody>;

export const AttachPermissionsBody = Type.Object(
  { permissionIds: Type.Array(Id, { minItems: 1, maxItems: 100 }) },
  { additionalProperties: false },
);
export type AttachPermissionsBody = Static<typeof AttachPermissionsBody>;

export const AssignRolesBody = Type.Object(
  { roleIds: Type.Array(Id, { minItems: 1, maxItems: 50 }) },
  { additionalProperties: false },
);
export type AssignRolesBody = Static<typeof AssignRolesBody>;
