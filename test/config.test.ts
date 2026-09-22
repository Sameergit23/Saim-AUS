import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';

const ORIGINAL_ENV = process.env;

function baseEnv(): NodeJS.ProcessEnv {
  return { JWT_SECRET: 'a-sufficiently-long-jwt-secret-value-32ch+' };
}

describe('loadConfig', () => {
  beforeEach(() => {
    process.env = baseEnv();
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('loads sensible defaults with only JWT_SECRET set', () => {
    const c = loadConfig();
    expect(c.env).toBe('development');
    expect(c.port).toBe(3000);
    expect(c.storage).toBe('memory');
    expect(c.accessTokenTtl).toBe('15m');
    expect(c.loginMaxAttempts).toBe(5);
    expect(c.allowedOrigins).toEqual([]);
    expect(c.jwtPreviousSecret).toBeNull();
  });

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => loadConfig()).toThrowError(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is too short', () => {
    process.env.JWT_SECRET = 'too-short';
    expect(() => loadConfig()).toThrowError(/at least 32/);
  });

  it('throws on an invalid STORAGE value', () => {
    process.env.STORAGE = 'mysql';
    expect(() => loadConfig()).toThrowError(/STORAGE/);
  });

  it('requires DATABASE_URL when STORAGE=postgres', () => {
    process.env.STORAGE = 'postgres';
    expect(() => loadConfig()).toThrowError(/DATABASE_URL/);
  });

  it('accepts STORAGE=postgres with a DATABASE_URL', () => {
    process.env.STORAGE = 'postgres';
    process.env.DATABASE_URL = 'postgres://localhost/db';
    expect(loadConfig().storage).toBe('postgres');
  });

  it('throws on a non-integer PORT', () => {
    process.env.PORT = 'abc';
    expect(() => loadConfig()).toThrowError(/PORT/);
  });

  it('throws when JWT_PREVIOUS_SECRET is too short', () => {
    process.env.JWT_PREVIOUS_SECRET = 'short';
    expect(() => loadConfig()).toThrowError(/JWT_PREVIOUS_SECRET/);
  });

  it('parses ALLOWED_ORIGINS into a trimmed list', () => {
    process.env.ALLOWED_ORIGINS = ' https://a.com , https://b.com ,';
    expect(loadConfig().allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
  });

  it('reads cookieSecure and cookieDomain', () => {
    process.env.COOKIE_SECURE = 'true';
    process.env.COOKIE_DOMAIN = 'example.com';
    const c = loadConfig();
    expect(c.cookieSecure).toBe(true);
    expect(c.cookieDomain).toBe('example.com');
  });
});
