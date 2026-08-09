const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { CountryWorkingDays, BlackoutPeriod, LeavePolicy, ConfigAuditLog } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const calc = require('../services/calculationService');
const { TEAMS, isValidTeam } = require('../config/teams');

const configAudit = (actorName, action, entity, entityId, before, after) =>
    ConfigAuditLog.create({ actorName, action, entity, entityId, before, after });

/* ---------------- shared dropdown options ---------------- */

// GET /coverage/options — the closed lists every coverage/onboarding form uses.
// Countries come from the configured leave policies (the same set the coverage
// config manages), teams from config/teams.js. Any authenticated user may read
// this: employees need it to label blackouts, HR needs it to create them.
router.get("/options", validateToken, async (req, res) => {
    const policies = await LeavePolicy.findAll({ order: [['countryName', 'ASC']] });
    res.json({
        countries: policies.map((p) => ({
            country: p.country,
            countryName: p.countryName,
            annualMin: p.annualMin,
            annualMax: p.annualMax
        })),
        teams: TEAMS
    });
});

/* ---------------- UC-29: weekend configuration per country ---------------- */

// GET /coverage/weekend-config — list all countries' working-day maps (with defaults filled in)
router.get("/weekend-config", validateToken, async (req, res) => {
    const policies = await LeavePolicy.findAll({ order: [['countryName', 'ASC']] });
    const rows = await CountryWorkingDays.findAll();
    const byCountry = Object.fromEntries(rows.map(r => [r.country, r.workingDays]));
    const list = policies.map(p => ({
        country: p.country,
        countryName: p.countryName,
        workingDays: byCountry[p.country] || { ...calc.DEFAULT_WORKING_DAYS }
    }));
    res.json(list);
});

// PUT /coverage/weekend-config — HR sets a country's weekend config (audit + before/after)
router.put("/weekend-config", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        country: yup.string().length(2).uppercase().required(),
        workingDays: yup.object({
            mon: yup.boolean().required(), tue: yup.boolean().required(),
            wed: yup.boolean().required(), thu: yup.boolean().required(),
            fri: yup.boolean().required(), sat: yup.boolean().required(),
            sun: yup.boolean().required()
        }).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (!calc.hasAtLeastOneWorkingDay(data.workingDays)) {
            return res.status(400).json({ message: "At least one working day per week is required." });
        }
        const before = await CountryWorkingDays.findOne({ where: { country: data.country } });
        const [row] = await CountryWorkingDays.findOrCreate({
            where: { country: data.country },
            defaults: { workingDays: data.workingDays }
        });
        const prev = before ? before.workingDays : { ...calc.DEFAULT_WORKING_DAYS };
        row.workingDays = data.workingDays;
        await row.save();
        await configAudit(req.user.name, `Weekend config updated for ${data.country}`,
            "country_working_days", data.country, prev, data.workingDays);
        res.json(row);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

/* ---------------- UC-18: blackout / restricted leave periods ---------------- */

// GET /coverage/blackouts — every authenticated user can read the periods that
// apply to them, because employees render them in red on the leave calendar.
//   default          -> COUNTRY periods for the caller's country + TEAM periods
//                       for the caller's team (what the calendar should show)
//   ?all=1           -> every active period (HR/Manager admin list only)
//   ?country=&team=  -> explicit override, for approvers looking at another scope
router.get("/blackouts", validateToken, async (req, res) => {
    const where = { active: true };
    const wantsAll = req.query.all === "1" && ["HR_ADMIN", "MANAGER"].includes(req.user.role);
    if (!wantsAll) {
        const country = String(req.query.country || req.user.country || "SG").toUpperCase();
        const team = req.query.team || req.user.team;
        where[Op.or] = [
            { scope: "COUNTRY", scopeId: country },
            { scope: "TEAM", scopeId: team }
        ];
    }
    const list = await BlackoutPeriod.findAll({ where, order: [['startDate', 'ASC']] });
    res.json(list);
});

// POST /coverage/blackouts — HR (any) or Manager (blackout) create a restricted window.
// scopeId is validated against the closed lists, never free text: a COUNTRY
// blackout must name a country that has a leave policy, a TEAM blackout must
// name one of the configured teams. Otherwise a typo silently produces a
// blackout that matches nobody.
router.post("/blackouts", validateToken, requireRole("HR_ADMIN", "MANAGER", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        scope: yup.string().oneOf(["COUNTRY", "TEAM"]).required(),
        scopeId: yup.string().max(50).required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        mode: yup.string().oneOf(["BLOCK", "SPECIAL_APPROVAL"]).default("SPECIAL_APPROVAL"),
        reason: yup.string().trim().max(200).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (data.endDate < data.startDate) {
            return res.status(400).json({ message: "endDate must be on or after startDate." });
        }

        let scopeId;
        if (data.scope === "COUNTRY") {
            scopeId = data.scopeId.toUpperCase();
            const policy = await LeavePolicy.findOne({ where: { country: scopeId } });
            if (!policy) {
                return res.status(400).json({ message: `${scopeId} is not a configured country. Pick one from the country list.` });
            }
        } else {
            scopeId = String(data.scopeId).trim();
            if (!isValidTeam(scopeId)) {
                return res.status(400).json({ message: `Unknown team. Pick one of: ${TEAMS.join(", ")}.` });
            }
        }

        const row = await BlackoutPeriod.create({
            scope: data.scope,
            scopeId,
            startDate: data.startDate, endDate: data.endDate,
            mode: data.mode, reason: data.reason || null, active: true
        });
        await configAudit(req.user.name,
            `Blackout ${data.mode} added (${data.scope} ${row.scopeId} ${data.startDate}->${data.endDate})`,
            "blackout_periods", String(row.id), null, row.toJSON());
        res.json(row);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

// PUT /coverage/blackouts/:id/deactivate — HR/Manager remove a window
router.put("/blackouts/:id/deactivate", validateToken, requireRole("HR_ADMIN", "MANAGER", "BOSS"), async (req, res) => {
    const row = await BlackoutPeriod.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    row.active = false;
    await row.save();
    await configAudit(req.user.name, `Blackout ${row.id} deactivated`,
        "blackout_periods", String(row.id), { active: true }, { active: false });
    res.json({ message: "Blackout period deactivated." });
});

module.exports = router;
