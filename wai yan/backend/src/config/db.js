/**
 * Database access layer.
 * - sqlite  (default for quick local testing) — Node built-in node:sqlite
 * - pglite  — embedded Postgres
 * - pg      — real PostgreSQL
 */
require('dotenv').config();

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

let impl = null;

function getImpl() {
  if (impl) return impl;
  if (driver === 'sqlite') {
    // eslint-disable-next-line global-require
    impl = require('./dbSqlite');
  } else if (driver === 'pglite') {
    // eslint-disable-next-line global-require
    impl = require('./dbPglite');
  } else {
    // eslint-disable-next-line global-require
    impl = require('./dbPg');
  }
  return impl;
}

module.exports = {
  query: (...args) => getImpl().query(...args),
  getClient: (...args) => getImpl().getClient(...args),
  pool: {
    end: async () => {
      const i = getImpl();
      if (i.end) return i.end();
      return undefined;
    },
    query: (...args) => getImpl().query(...args),
    connect: () => getImpl().getClient(),
  },
  driver,
  get raw() {
    return getImpl();
  },
};
