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
