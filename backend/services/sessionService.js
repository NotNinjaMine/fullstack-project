// UC-25: session tracking, security-event logging, and the 3-strikes /
// 15-minute lockout. The JWT stays stateless; session rows exist so the owner
// (and HR) can list/revoke, and every auth event is logged for the security log.
const crypto = require('crypto');
const { UserSession, SecurityEvent } = require('../models');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const LOCK_THRESHOLD = 3;
const LOCK_MINUTES = 15;

const logEvent = (userId, eventType, ipAddress, success = true) =>
  SecurityEvent.create({ userId, eventType, ipAddress: ipAddress || null, success });

const isLocked = (user) => !!(user.lockedUntil && new Date(user.lockedUntil) > new Date());

// Record a failed login; lock after LOCK_THRESHOLD consecutive failures.
const recordFailedLogin = async (user, ip) => {
  user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
  await logEvent(user.id, 'FAILED_LOGIN', ip, false);
  if (user.failedLoginCount >= LOCK_THRESHOLD) {
    user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    await user.save();
    await logEvent(user.id, 'LOCKED', ip, false);
    return { locked: true };
  }
  await user.save();
  return { locked: false };
};

// Clear counters on success and record a session + LOGIN event.
const recordSuccessfulLogin = async (user, token, req) => {
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  await user.save();

  const deviceInfo = (req.headers?.['user-agent'] || 'Unknown device').slice(0, 255);
  const ip = (req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '') || null;

  const session = await UserSession.create({
    userId: user.id,
    tokenHash: sha256(token),
    deviceInfo,
    ipAddress: ip ? String(ip).slice(0, 64) : null,
    lastActive: new Date(),
  });
  await logEvent(user.id, 'LOGIN', ip, true);
  return session;
};

module.exports = {
  sha256,
  LOCK_THRESHOLD,
  LOCK_MINUTES,
  logEvent,
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
};
