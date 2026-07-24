const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const yup = require('yup');
const { sign } = require('jsonwebtoken');
const { User, UserSession, SecurityEvent, LeavePolicy } = require('../models');
const { validateToken, requireRole } = require('../middlewares/auth');
const env = require('../config/env');
const session = require('../services/sessionService');
const { sendResetEmail, smtpConfigured } = require('../services/mailer');
const publicUser = require('../lib/publicUser');

const emailRule = yup.string().trim().lowercase().email().max(180).required();
const passwordRule = yup
  .string()
  .trim()
  .min(8)
  .max(72)
  .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, 'password needs at least 1 letter and 1 number')
  .required();

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/* ---------------- login + session (UC-01, UC-25) ---------------- */

router.post('/login', async (req, res) => {
  const schema = yup.object({
    email: emailRule,
    password: yup.string().trim().min(1).required(),
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const generic = { message: 'Invalid email or password.' };
    const user = await User.findOne({ where: { email: data.email } });
    if (!user) return res.status(401).json(generic);

    if (session.isLocked(user)) {
      return res.status(423).json({
        message: `Account locked after too many failed attempts. Try again after ${new Date(
          user.lockedUntil
        ).toLocaleTimeString('en-SG')}, or ask HR to unlock.`,
      });
    }
    if (user.status === 'INVITED') {
      return res.status(403).json({
        message: 'This account has not been activated. Please use your invitation link to set a password.',
      });
    }
    if (user.status === 'DEACTIVATED') {
      return res.status(403).json({ message: 'This account has been deactivated. Contact HR.' });
    }

    const match = await bcrypt.compare(data.password, user.password);
    if (!match) {
      const result = await session.recordFailedLogin(user, req.ip);
      if (result.locked) {
        return res.status(423).json({ message: 'Too many failed attempts — account locked for 15 minutes.' });
      }
      return res.status(401).json(generic);
    }

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      country: user.country,
      countryCode: user.countryCode,
      team: user.team,
      initials: user.initials,
    };
    const accessToken = sign(payload, env.APP_SECRET, { expiresIn: env.TOKEN_EXPIRES_IN });
    await session.recordSuccessfulLogin(user, accessToken, req);

    res.json({ accessToken, user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ errors: err.errors });
  }
});

router.get('/auth', validateToken, async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.sendStatus(401);
  res.json({ user: publicUser(user) });
});

/* ---------------- forgot / reset password (UC-23, public) ---------------- */

router.post('/forgot-password', async (req, res) => {
  const schema = yup.object({ email: emailRule });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const genericMsg = 'If that email is registered, a reset link has been sent. The link expires in 30 minutes.';
    const user = await User.findOne({ where: { email: data.email } });
    if (!user) return res.json({ message: genericMsg });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    await sendResetEmail(user.email, token);

    // Demo mode (no SMTP): return the token so the flow works offline.
    const demo = !smtpConfigured() ? { demoResetToken: token } : {};
    res.json({ message: genericMsg, ...demo });
  } catch (err) {
    res.status(400).json({ errors: err.errors });
  }
});

router.post('/reset-password', async (req, res) => {
  const schema = yup.object({
    token: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
    password: passwordRule,
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const user = await User.findOne({
      where: { resetTokenHash: sha256(data.token), resetTokenExpires: { [Op.gt]: new Date() } },
    });
    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    user.password = await bcrypt.hash(data.password, 10);
    user.resetTokenHash = null;
    user.resetTokenExpires = null;
    await user.save();
    await session.logEvent(user.id, 'PASSWORD_CHANGE', req.ip, true);
    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    res.status(400).json({ errors: err.errors });
  }
});

/* ---------------- self-service profile & preferences (UC-23) ---------------- */

router.get('/profile', validateToken, async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.sendStatus(404);
  res.json(publicUser(user));
});

router.put('/profile', validateToken, async (req, res) => {
  const schema = yup.object({
    name: yup.string().trim().min(2).max(120).optional(),
    phone: yup.string().trim().max(30).nullable().optional(),
    locale: yup.string().oneOf(['en', 'zh', 'th', 'vi', 'ms', 'id', 'ja']).optional(),
    notifyEmail: yup.boolean().optional(),
    notifyInApp: yup.boolean().optional(),
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const user = await User.findByPk(req.user.id);
    if (!user) return res.sendStatus(404);
    ['name', 'phone', 'locale', 'notifyEmail', 'notifyInApp'].forEach((k) => {
      if (data[k] !== undefined) user[k] = data[k];
    });
    await user.save();
    res.json({ message: 'Profile updated.', user: publicUser(user) });
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(400).json({ message: err.message || 'Invalid request.' });
  }
});

router.put('/password', validateToken, async (req, res) => {
  const schema = yup.object({
    currentPassword: yup.string().trim().min(1).required(),
    newPassword: passwordRule,
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const user = await User.findByPk(req.user.id);
    if (!user) return res.sendStatus(404);
    const ok = await bcrypt.compare(data.currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' });
    user.password = await bcrypt.hash(data.newPassword, 10);
    await user.save();
    await session.logEvent(user.id, 'PASSWORD_CHANGE', req.ip, true);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(400).json({ message: err.message || 'Invalid request.' });
  }
});

/* ---------------- sessions & security log (UC-25) ---------------- */

router.get('/sessions', validateToken, async (req, res) => {
  const list = await UserSession.findAll({
    where: { userId: req.user.id, revokedAt: null },
    order: [['lastActive', 'DESC']],
    attributes: ['id', 'deviceInfo', 'ipAddress', 'lastActive', 'createdAt'],
  });
  res.json(list);
});

router.put('/sessions/:id/revoke', validateToken, async (req, res) => {
  const s = await UserSession.findByPk(req.params.id);
  if (!s) return res.sendStatus(404);
  if (s.userId !== req.user.id) return res.sendStatus(403);
  s.revokedAt = new Date();
  await s.save();
  await session.logEvent(req.user.id, 'SESSION_REVOKED', req.ip, true);
  res.json({ message: 'Session revoked.' });
});

router.get('/security-log', validateToken, async (req, res) => {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const list = await SecurityEvent.findAll({
    where: { userId: req.user.id, createdAt: { [Op.gte]: oneYearAgo } },
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  res.json(list);
});

/* ---------------- HR: unlock & force-logout any user (UC-25) ---------------- */

router.put('/:id/unlock', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.sendStatus(404);
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  await user.save();
  res.json({ message: `${user.name} unlocked.` });
});

router.put('/:id/force-logout', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.sendStatus(404);
  const [revoked] = await UserSession.update(
    { revokedAt: new Date() },
    { where: { userId: user.id, revokedAt: null } }
  );
  await session.logEvent(user.id, 'SESSION_REVOKED', req.ip, true);
  res.json({ message: `${revoked} session(s) revoked for ${user.name}.`, revoked });
});

/* ---------------- country policies (for forms) ---------------- */

router.get('/policies', validateToken, async (req, res) => {
  const list = await LeavePolicy.findAll({ order: [['countryName', 'ASC']] });
  res.json(list);
});

module.exports = router;
