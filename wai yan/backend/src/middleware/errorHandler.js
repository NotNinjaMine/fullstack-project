const { fail } = require('../utils/response');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Log full error server-side; never leak stack to clients
  console.error('[error]', err.code || err.name, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // express.json body too large
  if (err.type === 'entity.too.large') {
    return fail(res, 413, 'VALIDATION_ERROR', 'Request body too large');
  }

  if (err.code === 'VALIDATION_ERROR') {
    return fail(res, 400, 'VALIDATION_ERROR', err.message);
  }
  if (err.code === 'INSUFFICIENT_BALANCE') {
    return fail(res, 400, 'INSUFFICIENT_BALANCE', err.message);
  }
  if (err.code === 'INVALID_DATE_RANGE') {
    return fail(res, 400, 'INVALID_DATE_RANGE', err.message);
  }
  if (err.code === 'MISSING_DATE_PARAMS') {
    return fail(res, 400, 'MISSING_DATE_PARAMS', err.message);
  }
  if (err.code === 'UNAUTHORISED') {
    return fail(res, 401, 'UNAUTHORISED', err.message || 'Unauthorised');
  }
  if (err.code === 'INVALID_CREDENTIALS') {
    return fail(res, 401, 'INVALID_CREDENTIALS', err.message || 'Invalid credentials');
  }
  if (err.code === 'FORBIDDEN') {
    return fail(res, 403, 'FORBIDDEN', err.message || 'Forbidden');
  }
  if (err.code === 'NOT_FOUND') {
    return fail(res, 404, 'NOT_FOUND', err.message || 'Not found');
  }
  if (err.code === 'ALREADY_ACTIONED') {
    return fail(res, 409, 'ALREADY_ACTIONED', err.message);
  }
  if (err.code === 'ALREADY_CANCELLED') {
    return fail(res, 409, 'ALREADY_CANCELLED', err.message);
  }

  return fail(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}

// Note: do not expose err.stack or SQL details in JSON responses.

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function appError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

module.exports = { errorHandler, asyncHandler, appError };
