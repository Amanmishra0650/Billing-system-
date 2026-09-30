// Compatibility entrypoint. Runtime storage is PostgreSQL; SQLite is migration-only.
export { createDatabase, getDatabase, initializeDatabase } from './database.mjs';
