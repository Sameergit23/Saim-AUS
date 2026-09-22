import type { FastifyInstance } from 'fastify';
import { bearerSecurity } from '../authGuard.js';
import type { RouteDeps } from './auth.js';

export function registerMeRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get(
    '/me',
    {
      schema: { tags: ['Profile'], summary: 'Get the current user profile', security: bearerSecurity },
      preHandler: deps.authenticate,
    },
    async (request) => {
      return deps.auth.getProfile(request.user!.sub);
    },
  );
}
