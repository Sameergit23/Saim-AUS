import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/api/errorHandler.js';
import { AppError } from '../src/core/domain/errors.js';

function mockReply() {
  const reply = { statusCode: 0, body: null as unknown } as unknown as FastifyReply & {
    body: unknown;
  };
  reply.status = ((code: number) => {
    (reply as { statusCode: number }).statusCode = code;
    return reply;
  }) as FastifyReply['status'];
  reply.send = ((payload: unknown) => {
    (reply as { body: unknown }).body = payload;
    return reply;
  }) as FastifyReply['send'];
  return reply;
}

const mockRequest = () =>
  ({ id: 'req-test', log: { error: vi.fn() } }) as unknown as FastifyRequest;

describe('errorHandler', () => {
  it('maps an AppError to its status and code', () => {
    const reply = mockReply();
    errorHandler(new AppError('TEAPOT', 'I am a teapot.', 418), mockRequest(), reply);
    expect(reply.statusCode).toBe(418);
    expect((reply.body as { error: { code: string } }).error.code).toBe('TEAPOT');
  });

  it('maps a schema validation failure to 400 VALIDATION_ERROR', () => {
    const reply = mockReply();
    const err = Object.assign(new Error('bad'), { validation: [{ message: 'x' }] });
    errorHandler(err as never, mockRequest(), reply);
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('maps a 429 to RATE_LIMITED', () => {
    const reply = mockReply();
    const err = Object.assign(new Error('slow down'), { statusCode: 429 });
    errorHandler(err as never, mockRequest(), reply);
    expect(reply.statusCode).toBe(429);
    expect((reply.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('maps an unexpected error to a generic 500 and logs it', () => {
    const reply = mockReply();
    const req = mockRequest();
    errorHandler(new Error('boom') as never, req, reply);
    expect(reply.statusCode).toBe(500);
    expect((reply.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
    expect(req.log.error).toHaveBeenCalled();
  });
});
