const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { fail } = require('../utils/response');
const { USER_PROFILE_COLUMNS } = require('../utils/userProfile');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return fail(res, 401, 'UNAUTHORISED', 'Missing or invalid authorization header');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return fail(res, 401, 'UNAUTHORISED', 'Invalid or expired token');
    }

    const result = await db.query(
      `SELECT ${USER_PROFILE_COLUMNS}
       FROM users WHERE id = $1`,
      [payload.sub]
    );

    if (result.rows.length === 0 || !result.rows[0].active) {
      return fail(res, 401, 'UNAUTHORISED', 'User not found or inactive');
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
