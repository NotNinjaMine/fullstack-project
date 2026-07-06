const { verify } = require('jsonwebtoken');
require('dotenv').config();

const validateToken = (req, res, next) => {
    try {
        const accessToken = req.header("Authorization").split(" ")[1];
        if (!accessToken) {
            return res.sendStatus(401);
        }

        const payload = verify(accessToken, process.env.APP_SECRET);
        req.user = payload;
        return next();
    }
    catch (err) {
        return res.sendStatus(401);
    }
}

// RBAC guard: usage requireRole("SUPERVISOR"), requireRole("EMPLOYEE", "MANAGER")
// The two-tier workflow depends on the SERVER enforcing roles, never the UI.
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Forbidden: insufficient role." });
    }
    return next();
}

module.exports = { validateToken, requireRole };
