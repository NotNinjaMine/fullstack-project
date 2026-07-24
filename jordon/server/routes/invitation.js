const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const yup = require('yup');
const { User, UserInvitation, LeavePolicy, LeaveBalance } = require('../models');
const { validateToken, requireRole } = require('../middlewares/auth');
const { createUserWithBalances } = require('../services/provisioning');
const { prorateEntitlement } = require('../lib/entitlement');
const { sendInviteEmail, smtpConfigured } = require('../services/mailer');
const { configAudit } = require('../services/audit');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/* ---------------- UC-24: HR sends an invitation ---------------- */

router.post('/', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const schema = yup.object({
    name: yup.string().trim().min(2).max(120).required(),
    email: yup.string().trim().lowercase().email().max(180).required(),
    countryCode: yup.string().length(2).uppercase().default('SG'),
    team: yup.string().max(80).default('Finance'),
    role: yup.string().oneOf(['EMPLOYEE', 'SUPERVISOR', 'MANAGER']).default('EMPLOYEE'),
    startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });

    if (await User.findOne({ where: { email: data.email } })) {
      return res.status(400).json({ message: 'Email already exists.' });
    }
    if (await UserInvitation.findOne({ where: { email: data.email, acceptedAt: null } })) {
      return res.status(400).json({ message: 'A pending invitation already exists for this email.' });
    }
    const policy = await LeavePolicy.findOne({ where: { country: data.countryCode } });
    if (!policy) return res.status(400).json({ message: `No policy configured for ${data.countryCode}.` });

    // Create the account up-front as INVITED (inactive) with a random password.
    await createUserWithBalances({
      name: data.name,
      email: data.email,
      password: crypto.randomBytes(12).toString('hex'),
      role: data.role,
      countryCode: data.countryCode,
      team: data.team,
      status: 'INVITED',
    });

    const token = crypto.randomBytes(32).toString('hex');
    const invite = await UserInvitation.create({
      email: data.email,
      name: data.name,
      countryCode: data.countryCode,
      team: data.team,
      role: data.role,
      startDate: data.startDate || null,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedByName: req.user.name,
    });

    await sendInviteEmail(data.email, token);
    await configAudit(
      req.user.name,
      `Invitation sent to ${data.email} (${data.role}, ${data.countryCode})`,
      'user_invitations',
      String(invite.id),
      null,
      { email: data.email, role: data.role, countryCode: data.countryCode }
    );

    const demo = !smtpConfigured() ? { demoInviteToken: token } : {};
    res.json({ message: `Invitation sent to ${data.email}. The link expires in 48 hours.`, invitationId: invite.id, ...demo });
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(err.status || 400).json({ message: err.message || 'Invitation failed.' });
  }
});

/* ---------------- UC-24: verify a token before showing the form (public) ---------------- */

router.get('/verify', async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return res.status(400).json({ message: 'Invalid token.' });
  const invite = await UserInvitation.findOne({
    where: { tokenHash: sha256(token), acceptedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!invite) return res.status(400).json({ message: 'This invitation is invalid or has expired.' });
  res.json({ email: invite.email, name: invite.name, country: invite.countryCode, team: invite.team, role: invite.role });
});

/* ---------------- UC-24: complete registration (public) ---------------- */

router.post('/accept', async (req, res) => {
  const schema = yup.object({
    token: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
    password: yup
      .string()
      .trim()
      .min(8)
      .max(72)
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, 'password needs at least 1 letter and 1 number')
      .required(),
    locale: yup.string().oneOf(['en', 'zh', 'th', 'vi', 'ms', 'id', 'ja']).default('en'),
    notifyEmail: yup.boolean().default(true),
    notifyInApp: yup.boolean().default(true),
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const invite = await UserInvitation.findOne({
      where: { tokenHash: sha256(data.token), acceptedAt: null, expiresAt: { [Op.gt]: new Date() } },
    });
    if (!invite) return res.status(400).json({ message: 'This invitation is invalid or has expired.' });

    const user = await User.findOne({ where: { email: invite.email } });
    if (!user) return res.status(400).json({ message: 'The invited account no longer exists.' });

    user.password = await bcrypt.hash(data.password, 10);
    user.status = 'ACTIVE';
    user.locale = data.locale;
    user.notifyEmail = data.notifyEmail;
    user.notifyInApp = data.notifyInApp;
    await user.save();

    // UC-24 → UC-20: pro-rate the annual entitlement from the start date.
    if (invite.startDate) {
      const policy = await LeavePolicy.findOne({ where: { country: user.countryCode } });
      const year = new Date(invite.startDate).getFullYear();
      const bal = await LeaveBalance.findOne({ where: { userId: user.id, leaveType: 'annual', year } });
      if (bal && policy) {
        bal.entitled = prorateEntitlement(policy.annualMin, invite.startDate, year);
        await bal.save();
      }
    }

    invite.acceptedAt = new Date();
    await invite.save();
    await configAudit(user.name, `Invitation accepted: ${user.email} activated`, 'users', String(user.id), { status: 'INVITED' }, { status: 'ACTIVE' });

    res.json({ message: 'Account activated. You can now sign in.' });
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(400).json({ message: err.message || 'Activation failed.' });
  }
});

/* ---------------- UC-24: HR lists invitations ---------------- */

router.get('/', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const rows = await UserInvitation.findAll({ order: [['createdAt', 'DESC']] });
  const now = Date.now();
  res.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      countryCode: r.countryCode,
      team: r.team,
      role: r.role,
      status: r.acceptedAt ? 'ACCEPTED' : new Date(r.expiresAt).getTime() < now ? 'EXPIRED' : 'PENDING',
      invitedByName: r.invitedByName,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }))
  );
});

module.exports = router;
