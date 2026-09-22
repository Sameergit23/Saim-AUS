import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Config } from '../../config/index.js';
import { Errors } from '../../core/domain/errors.js';
import type { AuthService, RequestContext } from '../../core/authn/authService.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from '../cookies.js';
import {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '../schemas.js';

export interface RouteDeps {
  auth: AuthService;
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
  const { auth, config } = deps;

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
    setRefreshCookie(reply, result.refreshToken, config);
    return reply.send({
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
      user: result.user,
    });
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
}
