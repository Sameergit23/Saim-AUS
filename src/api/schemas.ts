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
