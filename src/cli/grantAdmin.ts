import { loadConfig } from '../config/index.js';
import { createStorage } from '../storage/index.js';

/**
 * Bootstrap / operations helper: grant the built-in `admin` role to an existing
 * user by email. This is how the *first* administrator is created — register
 * normally, then an operator runs:
 *
 *   npm run grant-admin -- someone@example.com
 *
 * Uses the configured storage backend (intended for STORAGE=postgres; the
 * in-memory backend does not persist across processes).
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run grant-admin -- <email>');
    process.exit(1);
  }

  const config = loadConfig();
  if (config.storage !== 'postgres') {
    console.warn(
      `Warning: STORAGE=${config.storage}. This only has a lasting effect with STORAGE=postgres.`,
    );
  }

  const storage = createStorage(config);
  try {
    const user = await storage.users.findByEmail(email);
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
    await storage.roles.assignRoleByName(user.id, 'admin');
    console.log(
      `✓ Granted 'admin' to ${email}. Admin permissions apply on their next login or token refresh.`,
    );
  } finally {
    await storage.close();
  }
}

main().catch((err) => {
  console.error('grant-admin failed:', err);
  process.exit(1);
});
