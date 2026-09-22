import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { createCsrfGuard } from '../src/api/csrfGuard.js';
import { AppError } from '../src/core/domain/errors.js';

const reply = {} as FastifyReply;

function req(opts: {
  cookie?: boolean;
  origin?: string;
  referer?: string;
}): FastifyRequest {
  return {
    cookies: opts.cookie ? { refresh_token: 'x' } : {},
    headers: { origin: opts.origin, referer: opts.referer },
  } as unknown as FastifyRequest;
}

describe('csrfGuard', () => {
  const guard = createCsrfGuard(['https://app.example.com']);

  it('allows requests without the refresh cookie (Bearer/native flow)', async () => {
    await expect(guard(req({ cookie: false, origin: 'https://evil.com' }), reply)).resolves.toBeUndefined();
  });

  it('allows a cookie request from an allowed origin', async () => {
    await expect(
      guard(req({ cookie: true, origin: 'https://app.example.com' }), reply),
    ).resolves.toBeUndefined();
  });

  it('accepts the origin derived from the Referer header', async () => {
    await expect(
      guard(req({ cookie: true, referer: 'https://app.example.com/dashboard' }), reply),
    ).resolves.toBeUndefined();
  });

  it('rejects a cookie request from a disallowed origin', async () => {
    await expect(guard(req({ cookie: true, origin: 'https://evil.com' }), reply)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('rejects a cookie request with no origin/referer', async () => {
    await expect(guard(req({ cookie: true }), reply)).rejects.toBeInstanceOf(AppError);
  });

  it('skips enforcement when no allowed origins are configured', async () => {
    const open = createCsrfGuard([]);
    await expect(open(req({ cookie: true, origin: 'https://evil.com' }), reply)).resolves.toBeUndefined();
  });
});
