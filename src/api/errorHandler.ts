import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../core/domain/errors.js';

/**
 * Maps thrown errors to the standard error envelope (see API contract §1.1).
 * Never leaks internal details or stack traces to clients.
 */
export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id;

  if (error instanceof AppError) {
    reply.status(error.status).send({
      error: { code: error.code, message: error.message, requestId },
    });
    return;
  }

  // Fastify schema validation failures.
  if ((error as FastifyError).validation) {
    reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', requestId },
    });
    return;
  }

  // Rate limiting (from @fastify/rate-limit).
  const statusCode = (error as FastifyError).statusCode;
  if (statusCode === 429) {
    reply.status(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.', requestId },
    });
    return;
  }

  // Other client errors surfaced by Fastify (bad content-type, empty/malformed
  // body, payload too large, …) are 4xx — return them as such, not as 500.
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    reply.status(statusCode).send({
      error: { code: (error as FastifyError).code ?? 'BAD_REQUEST', message: error.message, requestId },
    });
    return;
  }

  // Anything else is unexpected: log server-side, return a generic 500.
  request.log.error({ err: error }, 'unhandled error');
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId },
  });
}
