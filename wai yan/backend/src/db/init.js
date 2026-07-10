/**
 * Apply schema.sql to the configured database.
 * Usage: npm run db:init
 */
const path = require('path');
const db = require('../config/db');
const { runSqlFile } = require('./runSqlFile');

async function main() {
  if (process.env.ALLOW_SCHEMA_RESET !== 'true') {
    throw new Error('Refusing destructive schema reset. Use npm run db:migrate for upgrades; set ALLOW_SCHEMA_RESET=true only for a disposable local database.');
  }
  const schemaPath =
    db.driver === 'sqlite'
      ? path.join(__dirname, 'schema.sqlite.sql')
      : path.join(__dirname, 'schema.sql');
  console.log(`Applying schema (driver=${db.driver})...`);
  const count = await runSqlFile(db, schemaPath);
  console.log(`Schema applied successfully (${count} statements).`);
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Schema init failed:', err.message);
  try {
    await db.pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
