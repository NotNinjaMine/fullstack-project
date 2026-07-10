const { fail } = require('../utils/response');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, 'UNAUTHORISED', 'Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      return fail(res, 403, 'FORBIDDEN', 'You do not have permission for this action');
    }
    return next();
  };
}

module.exports = { requireRole };
