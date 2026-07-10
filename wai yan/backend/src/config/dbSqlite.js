/**
 * SQLite driver for quick local testing (Node built-in node:sqlite).
 * Accepts Postgres-style $1 params and common PG snippets, converts for SQLite.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '../../data');
const defaultDbPath =
  process.env.SQLITE_PATH || path.join(dataDir, 'hr_leave.sqlite');

fs.mkdirSync(path.dirname(defaultDbPath), { recursive: true });

let database = null;

function getDb() {
  if (!database) {
    database = new DatabaseSync(defaultDbPath);
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('PRAGMA journal_mode = WAL;');
  }
  return database;
}

/**
 * Convert PG-ish SQL → SQLite.
 */
function adaptSql(sql) {
  let s = sql;

  // Strip PG-only locks / casts
  s = s.replace(/\s+FOR UPDATE\b/gi, '');
  s = s.replace(/::jsonb/gi, '');
  s = s.replace(/::text/gi, '');
  s = s.replace(/::int\b/gi, '');

  // Time functions
  s = s.replace(/\bNOW\(\)/gi, "datetime('now')");

  // EXTRACT(YEAR FROM col) → CAST(strftime('%Y', col) AS INTEGER)
  s = s.replace(
    /EXTRACT\s*\(\s*YEAR\s+FROM\s+([a-zA-Z0-9_.]+)\s*\)/gi,
    "CAST(strftime('%Y', $1) AS INTEGER)"
  );

  // COUNT(DISTINCT x)::int already stripped cast
  // INTERVAL comparisons used in reminderService — rewrite common pattern
  s = s.replace(
    /([a-zA-Z0-9_.]+)\s*<=\s*NOW\(\)\s*-\s*INTERVAL\s+'24 hours'/gi,
    "datetime($1) <= datetime('now', '-24 hours')"
  );
  s = s.replace(
    /([a-zA-Z0-9_.]+)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s+'24 hours'/gi,
    "datetime($1) >= datetime('now', '-24 hours')"
  );
  // After NOW() already replaced:
  s = s.replace(
    /([a-zA-Z0-9_.]+)\s*<=\s*datetime\('now'\)\s*-\s*INTERVAL\s+'24 hours'/gi,
    "datetime($1) <= datetime('now', '-24 hours')"
  );
  s = s.replace(
    /([a-zA-Z0-9_.]+)\s*>=\s*datetime\('now'\)\s*-\s*INTERVAL\s+'24 hours'/gi,
    "datetime($1) >= datetime('now', '-24 hours')"
  );
  s = s.replace(
    /INTERVAL\s+'24 hours'/gi,
    "datetime('now', '-24 hours')"
  );

  // Postgres string escape E'\n' → char(10) or real newline in concat
  s = s.replace(/E'\\n'/g, "char(10)");
  s = s.replace(/E'\n'/g, "char(10)");

  // Boolean TRUE/FALSE literals
  s = s.replace(/\bTRUE\b/gi, '1');
  s = s.replace(/\bFALSE\b/gi, '0');

  // ILIKE → LIKE (case-insensitive via LOWER if needed; we use LOWER() already)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  return s;
}

/**
 * $1-style params → ? with reordered values.
 */
function convertParams(sql, params = []) {
  const order = [];
  const converted = sql.replace(/\$(\d+)/g, (_, n) => {
    order.push(Number(n) - 1);
    return '?';
  });
  const values = order.map((i) => {
    const v = params[i];
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      // JSON objects for audit_log etc. — caller usually already stringified
      return typeof v === 'string' ? v : JSON.stringify(v);
    }
    if (v instanceof Date) return v.toISOString();
    return v;
  });
  return { sql: converted, params: values };
}

function normalizeRow(row) {
  if (!row) return row;
  const out = { ...row };
  // SQLite stores booleans as 0/1
  const boolFields = [
    'active',
    'half_day_flag',
    'special_approval_flag',
    'overlap_flag',
    'read_flag',
  ];
  for (const f of boolFields) {
    if (f in out && out[f] !== null && out[f] !== undefined) {
      out[f] = Boolean(out[f]);
    }
  }
  return out;
}

function runQuery(sql, params = []) {
  const db = getDb();
  let adapted = adaptSql(sql);
  const { sql: finalSql, params: values } = convertParams(adapted, params);

  const trimmed = finalSql.trim();
  const upper = trimmed.toUpperCase();

  // Multi-statement (rare): exec without params
  if (trimmed.includes(';') && !/\$|\?/.test(trimmed.split(';')[0]) && values.length === 0) {
    // handled by runSqlFile statement-by-statement usually
  }

  try {
    if (
      upper.startsWith('SELECT') ||
      upper.startsWith('WITH') ||
      upper.includes('RETURNING')
    ) {
      // INSERT/UPDATE ... RETURNING
      if (
        upper.startsWith('INSERT') ||
        upper.startsWith('UPDATE') ||
        upper.startsWith('DELETE')
      ) {
        const stmt = db.prepare(finalSql);
        const rows = stmt.all(...values).map(normalizeRow);
        return { rows, rowCount: rows.length };
      }
      const stmt = db.prepare(finalSql);
      const rows = stmt.all(...values).map(normalizeRow);
      return { rows, rowCount: rows.length };
    }

    if (
      upper.startsWith('INSERT') ||
      upper.startsWith('UPDATE') ||
      upper.startsWith('DELETE')
    ) {
      const stmt = db.prepare(finalSql);
      const info = stmt.run(...values);
      return {
        rows: [],
        rowCount: Number(info.changes || 0),
        lastInsertRowid: info.lastInsertRowid,
      };
    }

    // DDL / PRAGMA / BEGIN / COMMIT / etc.
    db.exec(finalSql);
    return { rows: [], rowCount: 0 };
  } catch (err) {
    err.query = finalSql;
    err.params = values;
    throw err;
  }
}

async function query(text, params = []) {
  return runQuery(text, params);
}

async function getClient() {
  return {
    async query(text, params = []) {
      return runQuery(text, params);
    },
    execRaw(sql) {
      getDb().exec(sql);
    },
    release() {
      // no-op (single connection)
    },
  };
}

async function end() {
  if (database) {
    database.close();
    database = null;
  }
}

function execRaw(sql) {
  getDb().exec(sql);
}

module.exports = {
  query,
  getClient,
  end,
  execRaw,
  getDb,
  dbPath: defaultDbPath,
};
