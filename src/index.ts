import { buildServer } from './api/server.js';
import { loadConfig } from './config/index.js';
import { createAuthService } from './core/authn/authService.js';
import { createRbacService } from './core/authz/rbacService.js';
import { createMfaService } from './core/mfa/mfaService.js';
import { createPasswordService } from './core/password/passwordService.js';
import { createTokenService } from './core/tokens/tokenService.js';
import { systemClock } from './infra/clock.js';
import { createCipher } from './infra/encryption.js';
import { createConsoleMailer, type Mailer } from './infra/mailer.js';
import { createSmtpMailer } from './infra/smtpMailer.js';
import { createStorage } from './storage/index.js';

/** Composition root: wire dependencies and start the server. */
async function main(): Promise<void> {
  const config = loadConfig();

  const storage = createStorage(config);
  const password = createPasswordService();
  const tokens = createTokenService({
    secret: config.jwtSecret,
    previousSecrets: config.jwtPreviousSecret ? [config.jwtPreviousSecret] : [],
    kid: config.jwtKid,
    accessTokenTtl: config.accessTokenTtl,
  });
  // Real email when SMTP is configured; otherwise log links to the console.
  const mailer: Mailer = config.smtpHost
    ? createSmtpMailer({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        user: config.smtpUser,
        pass: config.smtpPass,
        from: config.emailFrom,
      })
    : createConsoleMailer((msg) => console.log(msg));
  if (!config.smtpHost && config.env === 'production') {
    console.warn('[warn] SMTP not configured — verification/reset emails will only be logged.');
  }
  const cipher = createCipher(config.mfaSecretKey ?? config.jwtSecret);
  const mfa = createMfaService({ storage, cipher });

  const auth = createAuthService({
    storage,
    password,
    tokens,
    mailer,
    clock: systemClock,
    mfa,
    accessTokenTtl: config.accessTokenTtl,
    refreshTokenTtlDays: config.refreshTokenTtlDays,
    emailTokenTtlMinutes: config.emailTokenTtlMinutes,
    publicBaseUrl: config.publicBaseUrl,
    loginMaxAttempts: config.loginMaxAttempts,
    loginWindowMinutes: config.loginWindowMinutes,
  });

  const rbac = createRbacService({ storage, clock: systemClock });

  const app = await buildServer({ config, auth, rbac, mfa, tokens });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await storage.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`Saim-AUS listening on http://${config.host}:${config.port} (storage=${config.storage})`);
  } catch (err) {
    app.log.error(err);
    await storage.close();
    process.exit(1);
  }
}

void main();
