require('dotenv').config();
const db = require('../src/config/db');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('DB_DRIVER=', process.env.DB_DRIVER);
  try {
    const r = await db.query(
      'SELECT id, email, role, active FROM users ORDER BY id'
    );
    console.log('users count:', r.rows.length);
    console.log(r.rows);

    const full = await db.query(
      "SELECT password_hash FROM users WHERE email = $1",
      ['alice.tan@company.com']
    );
    if (!full.rows[0]) {
      console.log('alice.tan@company.com NOT FOUND');
    } else {
      const ok = await bcrypt.compare('Password123!', full.rows[0].password_hash);
      console.log('Password123! matches alice hash:', ok);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await db.pool.end();
  }
}

main();
