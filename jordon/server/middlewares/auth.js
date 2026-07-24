const { verify } = require('jsonwebtoken');
const env = require('../config/env');

// Verifies the Bearer JWT and attaches the decoded payload to req.user.
// The two-tier workflow + RBAC depend on the SERVER enforcing this, never the UI.
const validateToken = (req, res, next) => {
  try {
    const header = req.header('Authorization') || '';
    const accessToken = header.split(' ')[1];
    if (!accessToken) return res.sendStatus(401);
    req.user = verify(accessToken, env.APP_SECRET);
    return next();
  } catch (err) {
    return res.sendStatus(401);
  }
};

// RBAC guard: requireRole("HR_ADMIN") or requireRole("SUPERVISOR","MANAGER").
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: insufficient role.' });
  }
  return next();
};

module.exports = { validateToken, requireRole };
