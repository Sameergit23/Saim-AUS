import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config/index.js';
import type { AuthService } from '../core/authn/authService.js';
import type { RbacService } from '../core/authz/rbacService.js';
import type { TokenService } from '../core/tokens/tokenService.js';
import { createAuthenticate } from './authGuard.js';
import { errorHandler } from './errorHandler.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes, type RouteDeps } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMeRoutes } from './routes/me.js';

export interface ServerDeps {
  config: Config;
  auth: AuthService;
  rbac: RbacService;
  tokens: TokenService;
  logger?: boolean;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { config, auth, rbac, tokens } = deps;

  const app = Fastify({
    logger: deps.logger ?? config.env !== 'test',
    trustProxy: true, // honor X-Forwarded-For for request.ip behind a proxy
    bodyLimit: 64 * 1024, // bound payload size (DoS mitigation)
  });

  app.setErrorHandler(errorHandler);

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  const authenticate = createAuthenticate(tokens);
  const routeDeps: RouteDeps = { auth, config, authenticate };

  registerHealthRoutes(app);
  await app.register(
    async (instance) => {
      registerAuthRoutes(instance, routeDeps);
    },
    { prefix: '/api/v1/auth' },
  );
  await app.register(
    async (instance) => {
      registerMeRoutes(instance, routeDeps);
    },
    { prefix: '/api/v1' },
  );
  await app.register(
    async (instance) => {
      registerAdminRoutes(instance, { rbac, authenticate });
    },
    { prefix: '/api/v1/admin' },
  );

  return app;
}
