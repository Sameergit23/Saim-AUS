import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../core/domain/errors.js';
import { REFRESH_COOKIE } from './cookies.js';

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF protection for cookie-authenticated, state-changing endpoints
 * (`/auth/refresh`, `/auth/logout`). Defense-in-depth on top of the
 * `SameSite=Strict` refresh cookie (SEC-6).
 *
 * Only enforced when the request actually carries the refresh cookie (i.e. a
 * browser flow). Bearer/native clients send the token in the body and are not
 * CSRF-exposed. When `allowedOrigins` is empty (typical in dev), the check is
 * skipped and SameSite=Strict remains the sole protection.
 */
export function createCsrfGuard(allowedOrigins: string[]) {
  const allow = new Set(allowedOrigins);
  return async function csrfGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.cookies?.[REFRESH_COOKIE]) return;
    if (allow.size === 0) return;

    const origin = request.headers.origin ?? originFromReferer(request.headers.referer);
    if (!origin || !allow.has(origin)) {
      throw Errors.csrf();
    }
  };
}
