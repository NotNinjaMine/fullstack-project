const express = require('express');
const router = express.Router();
const { PublicHoliday } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');

// List holidays for the caller's country (or ?country=XX)
router.get("/", validateToken, async (req, res) => {
    const country = (req.query.country || req.user.country || "SG").toUpperCase();
    const list = await PublicHoliday.findAll({
        where: { country },
        order: [['date', 'ASC']]
    });
    res.json(list);
});

// Annual import (UC-06) - HR admin/manager only
router.post("/import", validateToken, requireRole("HR_ADMIN", "MANAGER"), async (req, res) => {
    let validationSchema = yup.object({
        country: yup.string().length(2).required(),
        holidays: yup.array().of(yup.object({
            date: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
            name: yup.string().max(80).required()
        })).min(1).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const rows = data.holidays.map(h => ({ ...h, country: data.country.toUpperCase() }));
        await PublicHoliday.bulkCreate(rows);
        res.json({ message: `${rows.length} holiday(s) imported for ${data.country}.` });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

module.exports = router;
