import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../config/index.js';
import { createPool } from './pool.js';

/** Applies the SQL migrations against the configured PostgreSQL database. */
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, 'migrations', '001_init.sql'), 'utf8');

  const pool = createPool(config.databaseUrl);
  try {
    await pool.query(sql);
    console.log('✓ Migration 001_init applied successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
