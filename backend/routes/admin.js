const express = require('express');
const router = express.Router();
const yup = require('yup');
const { LeavePolicy } = require('../models');
const { validateToken, requireRole } = require('../middlewares/auth');
const entitlement = require('../services/entitlementService');
const { prorateEntitlement } = require('../lib/entitlement');

/* ---------------- UC-20: policies + bulk entitlement & pro-ration ---------------- */

router.get('/policies', validateToken, async (req, res) => {
  const list = await LeavePolicy.findAll({ order: [['countryName', 'ASC']] });
  res.json(list);
});

router.get('/entitlement/preview', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(await entitlement.previewBulkEntitlement(year));
});

router.post('/entitlement/commit', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const schema = yup.object({
    year: yup.number().integer().min(2000).max(2100).default(new Date().getFullYear()),
  });
  try {
    const data = await schema.validate(req.body || {}, { abortEarly: false });
    res.json(await entitlement.commitBulkEntitlement(data.year, req.user.name));
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(400).json({ message: err.message || 'Commit failed.' });
  }
});

router.post('/entitlement/prorate', validateToken, requireRole('HR_ADMIN'), async (req, res) => {
  const schema = yup.object({
    fullEntitlement: yup.number().min(0).max(60).required(),
    startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
  });
  try {
    const data = await schema.validate(req.body, { abortEarly: false });
    const prorated = prorateEntitlement(data.fullEntitlement, data.startDate, new Date(data.startDate).getFullYear());
    res.json({ fullEntitlement: data.fullEntitlement, startDate: data.startDate, prorated });
  } catch (err) {
    if (err.errors) return res.status(400).json({ errors: err.errors });
    res.status(400).json({ message: err.message || 'Invalid request.' });
  }
});

module.exports = router;
