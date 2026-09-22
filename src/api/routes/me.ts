import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './auth.js';

export function registerMeRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/me', { preHandler: deps.authenticate }, async (request) => {
    return deps.auth.getProfile(request.user!.sub);
  });
}
