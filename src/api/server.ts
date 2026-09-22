import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config/index.js';
import type { AuthService } from '../core/authn/authService.js';
import type { RbacService } from '../core/authz/rbacService.js';
import type { TokenService } from '../core/tokens/tokenService.js';
import { createAuthenticate } from './authGuard.js';
import { createCsrfGuard } from './csrfGuard.js';
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

  // OpenAPI generation from route schemas. Registered before routes so it can
  // collect their schemas. Served as JSON at /api/v1/openapi.json and as an
  // interactive UI at /docs (see below).
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Saim-AUS API',
        description: 'Free, secure authentication & authorization service with RBAC.',
        version: '0.1.0',
        license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
      },
      tags: [
        { name: 'Auth', description: 'Registration, login, tokens, password' },
        { name: 'Profile', description: 'Current-user endpoints' },
        { name: 'Admin', description: 'User, role, and permission management (RBAC)' },
        { name: 'Ops', description: 'Health and operational endpoints' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  // Security response headers (nosniff, frame-options, HSTS, etc.). CSP is
  // disabled since this service returns JSON, not HTML (SEC / threat model).
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  const authenticate = createAuthenticate(tokens);
  const csrf = createCsrfGuard(config.allowedOrigins);
  const routeDeps: RouteDeps = { auth, config, authenticate, csrf };

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

  // Machine-readable spec is always available; the interactive UI is opt-in and
  // off by default in production (smaller attack surface).
  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  if (config.docsUi) {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  return app;
}
