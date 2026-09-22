import type { Config } from '../config/index.js';
import type { Storage } from './interfaces.js';
import { createMemoryStorage } from './memory/memoryStorage.js';
import { createPostgresStorage } from './postgres/postgresStorage.js';

/** Select the storage backend based on configuration. */
export function createStorage(config: Config): Storage {
  if (config.storage === 'postgres') {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required when STORAGE=postgres.');
    }
    return createPostgresStorage(config.databaseUrl);
  }
  return createMemoryStorage();
}
