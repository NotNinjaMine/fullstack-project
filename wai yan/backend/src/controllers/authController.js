const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { success } = require('../utils/response');
const { appError } = require('../middleware/errorHandler');
const { publicUser, USER_PROFILE_COLUMNS } = require('../utils/userProfile');

const SELF_SERVICE_PROFILE_FIELDS = ['phone', 'address'];

async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw appError('VALIDATION_ERROR', 'Email and password are required');
  }
  if (String(email).length > 255 || String(password).length > 200) {
    throw appError('VALIDATION_ERROR', 'Invalid credentials payload');
  }
  if (!process.env.JWT_SECRET) {
    throw appError('VALIDATION_ERROR', 'Server auth is not configured');
  }

  const result = await db.query(
    `SELECT ${USER_PROFILE_COLUMNS}, password_hash
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );

  const user = result.rows[0];
  let ok = false;
  try {
    if (user && user.active) {
      ok = await bcrypt.compare(password, user.password_hash);
    } else {
      await bcrypt.compare(
        password,
        user?.password_hash ||
          '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
      );
      ok = false;
    }
  } catch {
    ok = false;
  }

  if (!user || !user.active || !ok) {
    throw appError('INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return success(res, { token, user: publicUser(user) });
}

async function me(req, res) {
  // Re-fetch full profile (middleware may only have subset)
  const result = await db.query(
    `SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) {
    throw appError('UNAUTHORISED', 'User not found');
  }
  return success(res, publicUser(result.rows[0]));
}

/**
 * Update own profile fields (name, job title, phone, office, etc.).
 * Role / supervisor / manager links stay system-managed.
 */
async function updateMe(req, res) {
  const body = req.body || {};
  const address = body.address ?? body.personal_address;
  const fields = {
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
    ...(address !== undefined ? { address } : {}),
  };

  const sets = [];
  const params = [];
  for (const key of SELF_SERVICE_PROFILE_FIELDS) {
    if (fields[key] !== undefined) {
      params.push(typeof fields[key] === 'string' ? fields[key].trim() : fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    throw appError('VALIDATION_ERROR', 'Only phone and address can be updated here');
  }

  params.push(req.user.id);
  const result = await db.query(
    `UPDATE users SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING ${USER_PROFILE_COLUMNS}`,
    params
  );

  if (result.rows.length === 0) {
    throw appError('NOT_FOUND', 'User not found');
  }
  return success(res, publicUser(result.rows[0]));
}

/**
 * Staff directory search for apply-leave autocomplete (suggestions only).
 * Query matches name, employee_id, email, department, job_title, office.
 */
async function searchStaff(req, res) {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);

  if (q.length < 1) {
    return success(res, []);
  }

  const like = `%${q.replace(/[%_]/g, '')}%`;
  const result = await db.query(
    `SELECT ${USER_PROFILE_COLUMNS}
     FROM users
     WHERE COALESCE(active, 1) != 0
       AND (
         LOWER(name) LIKE LOWER($1)
         OR LOWER(email) LIKE LOWER($1)
         OR LOWER(COALESCE(employee_id, '')) LIKE LOWER($1)
         OR LOWER(COALESCE(department, '')) LIKE LOWER($1)
         OR LOWER(COALESCE(job_title, '')) LIKE LOWER($1)
         OR LOWER(COALESCE(office_branch, '')) LIKE LOWER($1)
         OR LOWER(COALESCE(office_city, '')) LIKE LOWER($1)
         OR LOWER(COALESCE(office_country, '')) LIKE LOWER($1)
         OR LOWER(COALESCE(phone, '')) LIKE LOWER($1)
       )
     ORDER BY name ASC
     LIMIT $2`,
    [like, limit]
  );

  return success(res, result.rows.map((r) => publicUser(r)));
}

module.exports = { login, me, updateMe, searchStaff };
