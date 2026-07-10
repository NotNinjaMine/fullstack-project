/**
 * Run a multi-statement SQL file statement-by-statement.
 * Works with both `pg` and PGlite (PGlite rejects multi-command prepared statements).
 */
const fs = require('fs');

/**
 * Split SQL into statements. Handles simple string literals; adequate for schema.sql.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += '/';
        i += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      current += ch;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

async function runSql(clientOrDb, sql) {
  const statements = splitStatements(sql);
  for (const stmt of statements) {
    // Prefer raw exec for DDL when available (SQLite PRAGMA / multi-token)
    if (clientOrDb.execRaw && !/\$\d+/.test(stmt)) {
      // eslint-disable-next-line no-await-in-loop
      clientOrDb.execRaw(stmt);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await clientOrDb.query(stmt);
    }
  }
  return statements.length;
}

async function runSqlFile(clientOrDb, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  return runSql(clientOrDb, sql);
}

module.exports = { splitStatements, runSql, runSqlFile };
