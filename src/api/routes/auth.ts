import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Config } from '../../config/index.js';
import { Errors } from '../../core/domain/errors.js';
import type { AuthService, LoginResult, RequestContext } from '../../core/authn/authService.js';
import type { MfaService } from '../../core/mfa/mfaService.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from '../cookies.js';
import {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  MfaCodeBody,
  MfaVerifyBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '../schemas.js';

export interface RouteDeps {
  auth: AuthService;
  mfa: MfaService;
  authenticate: preHandlerHookHandler;
  csrf: preHandlerHookHandler;
  config: Config;
}

const ctxOf = (request: FastifyRequest): RequestContext => ({
  userAgent: request.headers['user-agent'],
  ip: request.ip,
});

// Stricter rate limits on the sensitive credential endpoints (SEC-3).
const sensitive = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export function registerAuthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { auth, mfa, config } = deps;

  // Set the refresh cookie and return the access-token body for a completed login.
  const sendSession = (reply: FastifyReply, result: LoginResult) => {
    setRefreshCookie(reply, result.refreshToken, config);
    return reply.send({
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
      user: result.user,
    });
  };

  app.post('/register', { schema: { body: RegisterBody }, ...sensitive }, async (request, reply) => {
    const body = request.body as RegisterBody;
    await auth.register(body.email, body.password, ctxOf(request));
    return reply.status(202).send({
      message: 'If the email is valid, a verification link has been sent.',
    });
  });

  app.post('/verify-email', { schema: { body: VerifyEmailBody } }, async (request, reply) => {
    const body = request.body as VerifyEmailBody;
    await auth.verifyEmail(body.token);
    return reply.send({ message: 'Email verified. You can now log in.' });
  });

  app.post('/login', { schema: { body: LoginBody }, ...sensitive }, async (request, reply) => {
    const body = request.body as LoginBody;
    const result = await auth.login(body.email, body.password, ctxOf(request));
    // MFA-enabled accounts get a challenge instead of tokens; no cookie is set.
    if (result.mfaRequired) {
      return reply.send({ mfaRequired: true, mfaToken: result.mfaToken });
    }
    return sendSession(reply, result);
  });

  // No body schema: web clients call this with only the HttpOnly cookie (no body),
  // while native clients may send { refreshToken } in the body. Both are handled.
  app.post('/refresh', { preHandler: deps.csrf, ...sensitive }, async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    const token = readRefreshToken(request, body.refreshToken);
    if (!token) throw Errors.invalidToken();
    const result = await auth.refresh(token, ctxOf(request));
    setRefreshCookie(reply, result.refreshToken, config);
    return reply.send({
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
    });
  });

  app.post('/logout', { preHandler: deps.csrf }, async (request, reply) => {
    const token = readRefreshToken(request);
    if (token) await auth.logout(token);
    clearRefreshCookie(reply, config);
    return reply.status(204).send();
  });

  app.post('/password/forgot', { schema: { body: ForgotPasswordBody }, ...sensitive }, async (request, reply) => {
    const body = request.body as ForgotPasswordBody;
    await auth.forgotPassword(body.email, ctxOf(request));
    return reply.status(202).send({
      message: 'If the email is valid, a reset link has been sent.',
    });
  });

  app.post('/password/reset', { schema: { body: ResetPasswordBody } }, async (request, reply) => {
    const body = request.body as ResetPasswordBody;
    await auth.resetPassword(body.token, body.newPassword);
    return reply.send({ message: 'Password updated. Please log in again.' });
  });

  app.post(
    '/password/change',
    { schema: { body: ChangePasswordBody }, preHandler: deps.authenticate },
    async (request, reply) => {
      const body = request.body as ChangePasswordBody;
      await auth.changePassword(request.user!.sub, body.currentPassword, body.newPassword);
      return reply.send({ message: 'Password changed.' });
    },
  );

  // ---- MFA / TOTP ----

  // Step 2 of login: exchange the MFA challenge token + a code for a session.
  app.post('/mfa/verify', { schema: { body: MfaVerifyBody }, ...sensitive }, async (request, reply) => {
    const body = request.body as MfaVerifyBody;
    const result = await auth.completeMfaLogin(body.mfaToken, body.code, ctxOf(request));
    return sendSession(reply, result);
  });

  // Begin enrollment: returns a TOTP secret + otpauth URI (render as a QR code).
  app.post('/mfa/enroll', { preHandler: deps.authenticate }, async (request) => {
    return mfa.beginEnrollment(request.user!.sub);
  });

  // Confirm enrollment with a code from the authenticator app; returns recovery codes.
  app.post(
    '/mfa/confirm',
    { schema: { body: MfaCodeBody }, preHandler: deps.authenticate },
    async (request) => {
      const body = request.body as MfaCodeBody;
      return mfa.confirmEnrollment(request.user!.sub, body.code);
    },
  );

  // Disable MFA (requires a current TOTP or recovery code).
  app.post(
    '/mfa/disable',
    { schema: { body: MfaCodeBody }, preHandler: deps.authenticate },
    async (request, reply) => {
      const body = request.body as MfaCodeBody;
      await mfa.disable(request.user!.sub, body.code);
      return reply.send({ message: 'MFA disabled.' });
    },
  );
}
