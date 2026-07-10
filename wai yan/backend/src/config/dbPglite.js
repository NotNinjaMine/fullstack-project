/**
 * Embedded Postgres via PGlite — drop-in for local demo without installing PostgreSQL.
 * Data persists under backend/data/pglite.
 */
const path = require('path');
const fs = require('fs');

let dbPromise = null;
let chain = Promise.resolve();

function getDb() {
  if (!dbPromise) {
    // eslint-disable-next-line global-require
    const { PGlite } = require('@electric-sql/pglite');
    const dataDir =
      process.env.PGLITE_DATA_DIR ||
      path.join(__dirname, '../../data/pglite');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    dbPromise = PGlite.create(dataDir);
  }
  return dbPromise;
}

/** Serialize queries (PGlite is single-connection). */
function enqueue(fn) {
  const run = chain.then(fn, fn);
  // Keep chain alive even if a query fails
  chain = run.catch(() => {});
  return run;
}

async function query(text, params = []) {
  return enqueue(async () => {
    const db = await getDb();
    const result = await db.query(text, params);
    return {
      rows: result.rows || [],
      rowCount: result.affectedRows ?? result.rows?.length ?? 0,
      fields: result.fields,
    };
  });
}

/**
 * Transaction client compatible with pg PoolClient:
 * BEGIN / COMMIT / ROLLBACK via query, release() no-op.
 */
async function getClient() {
  const db = await getDb();
  let inTx = false;

  // Simple mutex for this client while "checked out"
  const client = {
    async query(text, params = []) {
      return enqueue(async () => {
        const result = await db.query(text, params);
        if (/^\s*BEGIN/i.test(text)) inTx = true;
        if (/^\s*(COMMIT|ROLLBACK)/i.test(text)) inTx = false;
        return {
          rows: result.rows || [],
          rowCount: result.affectedRows ?? result.rows?.length ?? 0,
        };
      });
    },
    release() {
      // no pool
      if (inTx) {
        // safety: roll back if caller forgot
        enqueue(async () => {
          try {
            await db.query('ROLLBACK');
          } catch {
            /* ignore */
          }
          inTx = false;
        });
      }
    },
  };
  return client;
}

async function end() {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}

module.exports = {
  query,
  getClient,
  end,
};
