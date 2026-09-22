import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../config/index.js';
import { createPool } from './pool.js';

/** Applies all SQL migrations (in filename order) against the configured database. */
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pool = createPool(config.databaseUrl);
  try {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      console.log(`✓ Applied ${file}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
