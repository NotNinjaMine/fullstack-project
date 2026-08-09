const { verify } = require('jsonwebtoken');
const crypto = require('crypto');
const { User, UserSession } = require('../models');
require('dotenv').config();

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// M1 (UC-25): verifying the JWT signature alone is NOT enough. A JWT stays valid
// until it expires (30 days), so on signature alone a revoked session, a locked
// account or a deactivated employee would keep working until then — which would
// make "force logout", "lock" and "deactivate" purely cosmetic.
//
// So every request also checks live state:
//   1. the session row for this exact token has not been revoked,
//   2. the account is not locked,
//   3. the account has not been deactivated.
// Any of those returns 401, and the client's axios interceptor turns a 401 into
// "clear the token and go back to the login screen" — so an admin action takes
// effect on the user's very next request.
//
// A token with NO session row (e.g. one signed directly by the integration
// tests, or issued before the session table existed) still falls back to the
// live user record rather than being rejected outright: the account checks above
// are the ones that actually enforce lock/deactivate, and force-logout sets both
// revokedAt AND the lock, so nothing is weakened by the fallback.
const validateToken = async (req, res, next) => {
    try {
        const header = req.header("Authorization");
        if (!header) return res.sendStatus(401);
        const accessToken = header.split(" ")[1];
        if (!accessToken) return res.sendStatus(401);

        const payload = verify(accessToken, process.env.APP_SECRET);

        // One query: the session for THIS token, with its owner attached.
        const session = await UserSession.findOne({
            where: { tokenHash: sha256(accessToken) },
            include: [{ model: User }]
        });

        if (session && session.revokedAt) return res.sendStatus(401);

        const user = session?.User || (payload?.id ? await User.findByPk(payload.id) : null);
        if (!user) return res.sendStatus(401);
        if (user.status === "DEACTIVATED") return res.sendStatus(401);
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return res.sendStatus(401);

        // Trust the live record over the token for role/team/country, so an HR
        // change takes effect without waiting for the user to sign in again.
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            country: user.country,
            // M5 (UC-10): gender-restricted leave types (maternity, NS/reservist)
            // are resolved from req.user, so this must be carried through or
            // GET /leave/types and resolveApplicableLeaveType hide them from
            // everyone — including the people who are eligible.
            gender: user.gender,
            team: user.team,
            initials: user.initials,
            // Carried so responses that rebuild a user object (e.g. GET
            // /user/auth on page refresh) can hand the client its language
            // immediately, instead of the UI briefly rendering English.
            locale: user.locale
        };
        req.session = session || null;
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
