const express = require('express');
const router = express.Router();
const { Op, fn, col } = require('sequelize');
const yup = require('yup');
const { Announcement, AnnouncementAck } = require('../models');
const { validateToken, requireRole } = require('../middlewares/auth');
const { configAudit } = require('../services/audit');

const todayISO = () => new Date().toISOString().slice(0, 10);

const targetsUser = (a, user) => {
  if (a.targetType === 'ALL') return true;
  if (a.targetType === 'COUNTRY') return a.targetValue === user.countryCode;
  if (a.targetType === 'ROLE') return a.targetValue === user.role;
  return false;
};

/* ---------------- UC-26: active announcements for the current user ---------------- */

router.get('/active', validateToken, async (req, res) => {
  const today = todayISO();
  const all = await Announcement.findAll({
    where: { active: true, startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } },
    order: [['createdAt', 'DESC']],
  });
  const targeted = all.filter((a) => targetsUser(a, req.user));

  const ids = targeted.map((a) => a.id);
  const acked = new Set(
    (
      await AnnouncementAck.findAll({
        where: { userId: req.user.id, announcementId: { [Op.in]: ids.length ? ids : [-1] } },
      })
    ).map((k) => k.announcementId)
  );

  res.json(
    targeted
      .filter((a) => !(a.requiresAck && acked.has(a.id)))
      .map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        requiresAck: a.requiresAck,
        createdByName: a.createdByName,
        startDate: a.startDate,
        endDate: a.endDate,
      }))
  );
});

router.post('/:id/ack', validateToken, async (req, res) => {
  const a = await Announcement.findByPk(req.params.id);
  if (!a) return res.sendStatus(404);
  await AnnouncementAck.findOrCreate({
    where: { announcementId: a.id, userId: req.user.id },
    defaults: { announcementId: a.id, userId: req.user.id },
  });
  res.json({ message: 'Acknowledged.' });
});

/* ---------------- UC-26: HR compose / manage ---------------- */

router.get('/', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const list = await Announcement.findAll({ order: [['createdAt', 'DESC']] });
  const counts = await AnnouncementAck.findAll({
    attributes: ['announcementId', [fn('COUNT', col('id')), 'ackCount']],
    group: ['announcementId'],
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.announcementId, Number(c.get('ackCount'))]));
  res.json(list.map((a) => ({ ...a.toJSON(), ackCount: countMap[a.id] || 0 })));
});

router.post('/', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const schema = yup.object({
    title: yup.string().trim().min(3).max(200).required(),
    body: yup.string().trim().min(3).max(1000).required(),
    targetType: yup.string().oneOf(['ALL', 'COUNTRY', 'ROLE']).default('ALL'),
    targetValue: yup.string().trim().max(20).nullable(),
    startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
    endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
    requiresAck: yup.boolean().default(false),
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    if (data.endDate < data.startDate) {
      return res.status(400).json({ message: 'endDate must be on or after startDate.' });
    }
    if (data.targetType !== 'ALL' && !data.targetValue) {
      return res.status(400).json({ message: 'targetValue is required for COUNTRY/ROLE targeting.' });
    }
    const a = await Announcement.create({
      title: data.title,
      body: data.body,
      targetType: data.targetType,
      targetValue: data.targetType === 'ALL' ? null : data.targetValue,
      startDate: data.startDate,
      endDate: data.endDate,
      requiresAck: data.requiresAck,
      createdByName: req.user.name,
      active: true,
    });
    await configAudit(req.user.name, `Announcement created: "${a.title}"`, 'announcements', String(a.id), null, a.toJSON());
    res.json(a);
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(400).json({ message: err.message || 'Invalid request.' });
  }
});

router.put('/:id/deactivate', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const a = await Announcement.findByPk(req.params.id);
  if (!a) return res.sendStatus(404);
  a.active = false;
  await a.save();
  await configAudit(req.user.name, `Announcement ended: "${a.title}"`, 'announcements', String(a.id), { active: true }, { active: false });
  res.json({ message: 'Announcement deactivated.' });
});

module.exports = router;
