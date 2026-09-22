import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config/index.js';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/v1/auth';

export function setRefreshCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: config.refreshTokenTtlDays * 86400,
    domain: config.cookieDomain,
  });
}

export function clearRefreshCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, domain: config.cookieDomain });
}

/** Read the refresh token from the HttpOnly cookie (web) or request body (native). */
export function readRefreshToken(request: FastifyRequest, bodyToken?: string): string | undefined {
  return request.cookies?.[REFRESH_COOKIE] ?? bodyToken;
}
