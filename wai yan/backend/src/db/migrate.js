/**
 * Apply idempotent SQL migrations under src/db/migrations/.
 * Usage: node src/db/migrate.js   (or npm run db:migrate)
 *
 * Tracks applied files in schema_migrations (created if missing).
 * ADD COLUMN migrations are safe if the column already exists.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  if (db.driver === 'sqlite') {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  } else {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }
}

async function isApplied(client, id) {
  const r = await client.query(
    `SELECT 1 AS ok FROM schema_migrations WHERE id = $1`,
    [id]
  );
  return r.rows.length > 0;
}

async function markApplied(client, id) {
  await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
}

function isDuplicateColumnError(err) {
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('duplicate column') ||
    msg.includes('already exists') ||
    (msg.includes('column') && msg.includes('exists'))
  );
}

async function applyMigration(client, fileName, sql) {
  const id = fileName;
  if (await isApplied(client, id)) {
    console.log(`  skip (already applied): ${id}`);
    return 'skipped';
  }

  // Adapt PG VARCHAR syntax for SQLite
  let body = sql;
  if (db.driver === 'sqlite') {
    body = body.replace(/VARCHAR\(\d+\)/gi, 'TEXT');
  }

  const statements = body
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  let executed = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.query(stmt);
      executed += 1;
    } catch (err) {
      // Continue statement-by-statement so a partially upgraded database receives
      // every missing column rather than being marked fully migrated too early.
      if (isDuplicateColumnError(err)) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  await markApplied(client, id);
  console.log(`  ${executed ? 'applied' : 'skip'}: ${id}${skipped ? ` (${skipped} already present)` : ''}`);
  return executed ? 'applied' : 'skipped';
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found.');
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Running migrations (driver=${db.driver})...`);
  const client = await db.pool.connect();
  try {
    await ensureMigrationsTable(client);
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // eslint-disable-next-line no-await-in-loop
      await applyMigration(client, file, sql);
    }
    console.log('Migrations complete.');
  } finally {
    if (client.release) client.release();
    await db.pool.end().catch(() => {});
  }
}

main().catch(async (err) => {
  console.error('Migration failed:', err.message);
  try {
    await db.pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
