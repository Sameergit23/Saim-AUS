import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../core/domain/errors.js';
import type { AccessClaims, TokenService } from '../core/tokens/tokenService.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

/**
 * Builds a preHandler that authenticates a request via the Bearer access token
 * and attaches the verified claims to `request.user`. Stateless — no DB call.
 */
export function createAuthenticate(tokens: TokenService) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw Errors.unauthenticated();
    }
    const token = header.slice('Bearer '.length).trim();
    request.user = await tokens.verifyAccessToken(token);
  };
}

/**
 * Builds a preHandler enforcing that the caller holds a specific permission.
 * Deny-by-default (SEC-9): a request without the permission is rejected with 403.
 * Must run AFTER `authenticate` so `request.user` (and its permission snapshot) is set.
 */
export function createRequirePermission(permission: string) {
  return async function requirePermission(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const perms = request.user?.perms ?? [];
    if (!perms.includes(permission)) {
      throw Errors.forbidden(`Missing permission: ${permission}`);
    }
  };
}
