import 'dotenv/config';

/**
 * Application configuration, loaded and validated from environment variables.
 * Fails fast at boot if required values are missing or invalid (see NFR / §7 config).
 */
export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  storage: 'memory' | 'postgres';
  databaseUrl: string | null;
  jwtSecret: string;
  jwtKid: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  emailTokenTtlMinutes: number;
  cookieSecure: boolean;
  cookieDomain: string | undefined;
  publicBaseUrl: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function toInt(value: string, name: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  return n;
}

export function loadConfig(): Config {
  const storage = optional('STORAGE', 'memory');
  if (storage !== 'memory' && storage !== 'postgres') {
    throw new Error(`STORAGE must be "memory" or "postgres", got: ${storage}`);
  }

  const env = optional('NODE_ENV', 'development') as Config['env'];

  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for adequate signing strength.');
  }

  const databaseUrl = storage === 'postgres' ? required('DATABASE_URL') : process.env.DATABASE_URL ?? null;

  return {
    env,
    host: optional('HOST', '0.0.0.0'),
    port: toInt(optional('PORT', '3000'), 'PORT'),
    storage,
    databaseUrl,
    jwtSecret,
    jwtKid: optional('JWT_KID', 'default'),
    accessTokenTtl: optional('ACCESS_TOKEN_TTL', '15m'),
    refreshTokenTtlDays: toInt(optional('REFRESH_TOKEN_TTL_DAYS', '30'), 'REFRESH_TOKEN_TTL_DAYS'),
    emailTokenTtlMinutes: toInt(optional('EMAIL_TOKEN_TTL_MINUTES', '60'), 'EMAIL_TOKEN_TTL_MINUTES'),
    cookieSecure: optional('COOKIE_SECURE', 'false') === 'true',
    cookieDomain: process.env.COOKIE_DOMAIN?.trim() || undefined,
    publicBaseUrl: optional('PUBLIC_BASE_URL', 'http://localhost:3000'),
  };
}
