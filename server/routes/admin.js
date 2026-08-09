const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, LeaveBalance, LeavePolicy, LeaveType, LeaveRequest, ConfigAuditLog, UserInvitation, UserSession } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { createUserWithBalances } = require('../services/provisioning');
const { runCarryForward, previewCarryForward, sendForfeitureReminders } = require('../services/carryForwardService');
const entitlement = require('../services/entitlementService');
const { currentLeaveYear } = require('../services/leaveYearService');
// Who approves whose leave - consulted when a role change would move someone
// into a different approval chain.
const chain = require('../services/approvalChain');

const configAudit = (actorName, action, entity, entityId, before, after) =>
    ConfigAuditLog.create({ actorName, action, entity, entityId, before, after });

const remaining = (b) => Number(b.entitled) + Number(b.carried) - Number(b.used);

/* ================= UC-10a: employee records (Member 1) =================
   Add/view staff and CSV import. These endpoints read/write the same User
   records as onboarding (UC-24) and account recovery (UC-25) — see
   routes/invitation.js and PUT /:id/unlock in routes/user.js. Policy and
   leave-type configuration below remain UC-10b (Member 5). ================= */

// Remove placeholder accounts for invitations that were never accepted and have
// now expired. Creating an invitation also creates an INVITED account so the
// invitee appears in the directory as "Invited (pending)" — but once the 48-hour
// window closes that invite can never be used, so leaving the row there shows a
// pending invite that will never complete. Deleting is safe because the account
// was never activated: no leave history, approvals or audit trail to preserve.
//
// Done lazily on read, mirroring expireStale() in routes/swap.js, so there is no
// scheduler to keep alive.
const purgeExpiredInvitePlaceholders = async () => {
    const expired = await UserInvitation.findAll({
        where: {
            acceptedAt: null,
            cancelledAt: null,
            expiresAt: { [Op.lt]: new Date() }
        }
    });
    let removed = 0;
    for (const invite of expired) {
        const placeholder = await User.findOne({ where: { email: invite.email } });
        if (placeholder && placeholder.status === "INVITED") {
            await LeaveBalance.destroy({ where: { userId: placeholder.id } });
            await placeholder.destroy();
            removed++;
        }
    }
    if (removed) console.log(`[admin] removed ${removed} expired invitation placeholder account(s)`);
    return removed;
};

// GET /admin/employees — full staff list with current-year balances.
// Managers are included alongside HR because they already hold the account-admin
// powers this list drives (PUT /user/:id/unlock and /force-logout both allow
// MANAGER), and their recovery panel renders the SAME table from this one source
// so the two views can never show different data.
router.get("/employees", validateToken, requireRole("HR_ADMIN", "MANAGER", "BOSS"), async (req, res) => {
    await purgeExpiredInvitePlaceholders();
    const year = await currentLeaveYear();
    const users = await User.findAll({
        attributes: ["id", "name", "email", "role", "country", "gender", "team", "initials", "status", "lockedUntil", "lockReason", "failedLoginCount"],
        order: [['name', 'ASC']]
    });
    const balances = await LeaveBalance.findAll({ where: { year } });
    const byUser = {};
    for (const b of balances) {
        (byUser[b.userId] = byUser[b.userId] || []).push({
            leaveType: b.leaveType, entitled: Number(b.entitled),
            carried: Number(b.carried), used: Number(b.used), remaining: remaining(b)
        });
    }
    res.json(users.map(u => ({ ...u.toJSON(), balances: byUser[u.id] || [] })));
});

// POST /admin/employees — HR creates any role/country (provisioned from policy)
router.post("/employees", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        name: yup.string().trim().min(3).max(50).required(),
        email: yup.string().trim().lowercase().email().max(50).required(),
        tempPassword: yup.string().trim().min(8).max(50).required()
            .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, "password at least 1 letter and 1 number"),
        role: yup.string().oneOf(["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"]).default("EMPLOYEE"),
        country: yup.string().length(2).uppercase().required(),
        gender: yup.string().oneOf(["MALE", "FEMALE", "", null]).nullable(),
        team: yup.string().max(50).default("Compliance Team A"),
        annualEntitlement: yup.number().min(0).max(60).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const existing = await User.findOne({ where: { email: data.email } });
        if (existing) return res.status(400).json({ message: "Email already exists." });

        const { user, policy } = await createUserWithBalances({
            name: data.name, email: data.email, password: data.tempPassword,
            role: data.role, country: data.country, gender: data.gender || null, team: data.team,
            annualEntitlement: data.annualEntitlement
        });
        await configAudit(req.user.name, `Employee created: ${user.email} (${user.role}, ${user.country})`,
            "users", String(user.id), null, { email: user.email, role: user.role, country: user.country });
        res.json({
            message: `${user.name} added to ${user.team} (${policy.countryName}).`,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, country: user.country, team: user.team, initials: user.initials }
        });
    } catch (err) {
        res.status(err.status || 400).json(err.errors ? { errors: err.errors } : { message: err.message });
    }
});

// Roles a CSV row may set. Deliberately excludes BOSS - see the role-change
// endpoint below for the only path that assigns it.
const IMPORTABLE_ROLES = ["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"];

// POST /admin/employees/import — CSV staff import (name,email,role,country,team[,annual])
router.post("/employees/import", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        csv: yup.string().trim().min(1).required(),
        defaultPassword: yup.string().trim().min(8).max(50)
            .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, "password at least 1 letter and 1 number")
            .default("Welcome123")
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const lines = data.csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // Optional header row
        let startIdx = 0;
        if (/name/i.test(lines[0]) && /email/i.test(lines[0])) startIdx = 1;

        const results = [];
        for (let i = startIdx; i < lines.length; i++) {
            const [name, email, role, country, team, genderOrAnnual, annual] = lines[i].split(",").map(s => (s || "").trim());
            if (!name || !email) { results.push({ line: i + 1, ok: false, message: "name and email required" }); continue; }
            // BOSS is never creatable in bulk (or anywhere an account is first
            // made) - it is only ever reached by changing an existing person's
            // role in the staff details table. Without this check a CSV could
            // mint one, since the column is free text.
            const requestedRole = (role || "EMPLOYEE").toUpperCase();
            if (!IMPORTABLE_ROLES.includes(requestedRole)) {
                results.push({ email, ok: false, message: `role must be one of ${IMPORTABLE_ROLES.join("/")}` });
                continue;
            }
            try {
                const exists = await User.findOne({ where: { email: email.toLowerCase() } });
                if (exists) { results.push({ email, ok: false, message: "already exists" }); continue; }
                // The optional 6th column may be a gender (MALE/FEMALE) or, for older
                // CSVs written before this column existed, the annual-days figure.
                const genderColIsGender = /^(MALE|FEMALE)$/i.test(genderOrAnnual || "");
                const gender = genderColIsGender ? genderOrAnnual.toUpperCase() : null;
                const annualDays = genderColIsGender ? annual : (genderOrAnnual || annual);
                const { user } = await createUserWithBalances({
                    name, email: email.toLowerCase(), password: data.defaultPassword,
                    role: requestedRole,
                    country: (country || "SG").toUpperCase(),
                    gender,
                    team: team || "Compliance Team A",
                    annualEntitlement: annualDays ? Number(annualDays) : null
                });
                results.push({ email: user.email, ok: true });
            } catch (e) {
                results.push({ email, ok: false, message: e.message });
            }
        }
        const created = results.filter(r => r.ok).length;
        await configAudit(req.user.name, `CSV import: ${created} employee(s) created`, "users", null, null, { created });
        res.json({ created, results });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Import failed." });
    }
});

// GET /admin/policies — full policy list (edit form)
/* ---------------- Change someone's role (staff details table) ----------------
 *
 * The role IS the page: App.jsx picks the Employee / Approver / HR console from
 * user.role, and services/approvalChain.js routes leave from it. So changing a
 * role here has to do three things atomically-ish:
 *   1. write the new role,
 *   2. end the person's sessions, so their JWT (which carries the OLD role)
 *      cannot keep them on a page they no longer belong on until it expires,
 *   3. record it in the config audit trail.
 *
 * Who may assign what:
 *   BOSS      -> any role, including BOSS and HR_ADMIN
 *   HR_ADMIN  -> EMPLOYEE / SUPERVISOR / MANAGER only
 *   MANAGER   -> EMPLOYEE / SUPERVISOR / MANAGER only
 * so neither HR nor a Manager can mint a peer or promote someone above
 * themselves. Nobody can change their own role, at any level.
 */
const ASSIGNABLE_BY = {
    BOSS: ["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"],
    HR_ADMIN: ["EMPLOYEE", "SUPERVISOR", "MANAGER"],
    MANAGER: ["EMPLOYEE", "SUPERVISOR", "MANAGER"]
};

// GET /admin/assignable-roles — what the caller is allowed to put in the
// dropdown. The client renders from this, so the menu can never offer something
// the server would refuse.
router.get("/assignable-roles", validateToken, requireRole("HR_ADMIN", "MANAGER", "BOSS"), async (req, res) => {
    res.json({ roles: ASSIGNABLE_BY[req.user.role] || [] });
});

// PUT /admin/employees/:id/role { role }
router.put("/employees/:id/role", validateToken, requireRole("HR_ADMIN", "MANAGER", "BOSS"), async (req, res) => {
    const allowed = ASSIGNABLE_BY[req.user.role] || [];
    let validationSchema = yup.object({
        role: yup.string().trim().uppercase().oneOf(chain.ROLES).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        const user = await User.findByPk(req.params.id);
        if (!user) return res.sendStatus(404);

        if (Number(user.id) === Number(req.user.id)) {
            return res.status(400).json({
                message: "You cannot change your own role. Ask someone with the right to do it for you."
            });
        }
        if (!allowed.includes(data.role)) {
            return res.status(403).json({
                message: `Your role can only assign: ${allowed.join(", ")}.`
            });
        }
        // Symmetrically, you cannot demote someone who outranks what you may
        // assign — otherwise a Manager could strip the Boss or an HR Admin.
        if (!allowed.includes(user.role)) {
            return res.status(403).json({
                message: `You are not allowed to change a ${user.role}'s role.`
            });
        }
        if (user.role === data.role) {
            return res.status(400).json({ message: `${user.name} is already a ${data.role}.` });
        }
        if (user.status === "DEACTIVATED") {
            return res.status(400).json({ message: "Restore the account before changing its role." });
        }

        // Guard the approval chain. A live request is authorised from the
        // APPLICANT's current role (services/approvalChain.js), so moving
        // someone mid-flight would silently re-route requests that are already
        // sitting in someone's queue — or strand them where no one can act.
        const liveCount = await LeaveRequest.count({
            where: { employeeId: user.id, status: { [Op.in]: chain.PENDING_STATUSES } }
        });
        if (liveCount > 0) {
            return res.status(409).json({
                message: `${user.name} has ${liveCount} leave request(s) still awaiting a decision. ` +
                    `Those must be approved, rejected or cancelled before their role can change, ` +
                    `because the approval route depends on it.`
            });
        }

        // Last-HR-admin guard, mirroring the deactivate rule in routes/user.js:
        // the console must never become unreachable.
        if (user.role === "HR_ADMIN" && data.role !== "HR_ADMIN") {
            const others = await User.count({
                where: { role: "HR_ADMIN", status: "ACTIVE", id: { [Op.ne]: user.id } }
            });
            if (others === 0) {
                return res.status(400).json({
                    message: "This is the last active HR Admin. Promote someone else first."
                });
            }
        }

        const before = user.role;
        user.role = data.role;
        await user.save();

        // The JWT carries the role, so an existing session would keep showing
        // the old page. End their sessions and make them sign in again.
        const [revoked] = await UserSession.update(
            { revokedAt: new Date() },
            { where: { userId: user.id, revokedAt: null } }
        );

        await configAudit(
            req.user.name,
            `Role changed: ${user.email} ${before} -> ${data.role}`,
            "users", String(user.id), { role: before }, { role: data.role }
        );

        res.json({
            message: `${user.name} is now ${data.role}.` +
                (revoked ? ` ${revoked} session(s) ended — they'll sign in again to the new view.` : ""),
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not change that role." });
    }
});

router.get("/policies", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const list = await LeavePolicy.findAll({ order: [['countryName', 'ASC']] });
    res.json(list);
});

// PUT /admin/policies/:country — edit a country's statutory policy
router.put("/policies/:country", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        annualMin: yup.number().integer().min(0).max(60).required(),
        annualMax: yup.number().integer().min(0).max(60).required(),
        sickMc: yup.number().integer().min(0).max(90).required(),
        sickNoMc: yup.number().integer().min(0).max(30).required(),
        carryForwardMax: yup.number().integer().min(0).max(30).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (data.annualMax < data.annualMin) {
            return res.status(400).json({ message: "annualMax must be >= annualMin." });
        }
        const policy = await LeavePolicy.findOne({ where: { country: req.params.country.toUpperCase() } });
        if (!policy) return res.sendStatus(404);
        const before = policy.toJSON();
        Object.assign(policy, data);
        await policy.save();
        await configAudit(req.user.name, `Policy updated for ${policy.country}`,
            "leave_policies", policy.country, before, policy.toJSON());
        res.json(policy);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

/* ================= UC-10: leave-type configuration ================= */

router.get("/leave-types", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const list = await LeaveType.findAll({ order: [['code', 'ASC']] });
    res.json(list);
});

router.put("/leave-types/:code", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        name: yup.string().trim().max(50).required(),
        affectsAnnualBalance: yup.boolean().default(false),
        affectsSickBalance: yup.boolean().default(false),
        requiresMc: yup.boolean().default(false),
        active: yup.boolean().default(true),
        // Empty/omitted array = every country. Each entry is a 2-letter code
        // matching an existing leave_policies.country row.
        applicableCountries: yup.array().of(yup.string().trim().length(2).uppercase()).default([]),
        genderRestriction: yup.string().oneOf(["ANY", "MALE", "FEMALE"]).default("ANY")
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        // Store "applies everywhere" as null, not an empty array, so older rows
        // (seeded before this field existed) behave identically.
        const payload = { ...data, applicableCountries: data.applicableCountries.length ? data.applicableCountries : null };
        const [row] = await LeaveType.findOrCreate({
            where: { code: req.params.code.toLowerCase() },
            defaults: { code: req.params.code.toLowerCase(), ...payload }
        });
        const before = row.toJSON();
        Object.assign(row, payload);
        await row.save();
        await configAudit(req.user.name, `Leave type ${row.code} updated`,
            "leave_types", row.code, before, row.toJSON());
        res.json(row);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

/* ================= UC-10: HR dashboard summary ================= */

router.get("/dashboard", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const year = new Date().getFullYear();
    const [pendingSup, pendingMgr, pendingBoss, approvedYtd, staffCount, flaggedPending] = await Promise.all([
        LeaveRequest.count({ where: { status: "PENDING_SUPERVISOR" } }),
        LeaveRequest.count({ where: { status: "PENDING_MANAGER" } }),
        // Managers' own leave, waiting on the Boss - counted separately so the
        // dashboard totals still add up to every open request.
        LeaveRequest.count({ where: { status: "PENDING_BOSS" } }),
        LeaveRequest.count({ where: { status: "APPROVED" } }),
        User.count(),
        LeaveRequest.count({ where: { status: { [Op.in]: chain.PENDING_STATUSES }, flagged: true } })
    ]);
    // Pending by country
    const users = await User.findAll({ attributes: ["id", "country"] });
    const countryOf = Object.fromEntries(users.map(u => [u.id, u.country]));
    const pending = await LeaveRequest.findAll({
        where: { status: { [Op.in]: chain.PENDING_STATUSES } },
        attributes: ["employeeId"]
    });
    const byCountry = {};
    for (const p of pending) { const c = countryOf[p.employeeId] || "??"; byCountry[c] = (byCountry[c] || 0) + 1; }

    // This year's approved leave, by type — reads the same LeaveType catalogue
    // HR configures under Policies & types, so custom types (e.g. Maternity,
    // NS Leave) show up here automatically.
    const approvedThisYear = await LeaveRequest.findAll({
        where: { status: "APPROVED", startDate: { [Op.gte]: `${year}-01-01`, [Op.lte]: `${year}-12-31` } },
        attributes: ["leaveType", "days"]
    });
    const typeCatalogue = await LeaveType.findAll({ attributes: ["code", "name"] });
    const typeNameOf = Object.fromEntries(typeCatalogue.map(t => [t.code, t.name]));
    const byType = {};
    for (const r of approvedThisYear) { byType[r.leaveType] = (byType[r.leaveType] || 0) + Number(r.days); }
    const approvedByType = Object.entries(byType)
        .map(([code, days]) => ({ code, name: typeNameOf[code] || code, days }))
        .sort((a, b) => b.days - a.days);

    res.json({
        pendingSupervisor: pendingSup,
        pendingManager: pendingMgr,
        pendingBoss,
        approvedTotal: approvedYtd,
        staffCount,
        flaggedPending,
        pendingByCountry: Object.entries(byCountry).map(([country, count]) => ({ country, count })),
        approvedByType
    });
});

/* ================= UC-04: year-end carry-forward ================= */

// GET /admin/carry-forward/preview?fromYear= — what the run WOULD do (no writes).
router.get("/carry-forward/preview", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const fromYear = Number(req.query.fromYear) || await currentLeaveYear();
        const preview = await previewCarryForward(fromYear);
        res.json(preview);
    } catch (err) {
        res.status(400).json({ message: err.message || "Could not build preview." });
    }
});

// POST /admin/carry-forward/trigger — manual run for the live demo
router.post("/carry-forward/trigger", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const activeYear = await currentLeaveYear();
        let validationSchema = yup.object({
            fromYear: yup.number().integer().min(2000).max(2100).default(activeYear)
        });
        const data = await validationSchema.validate(req.body || {}, { abortEarly: false });
        const result = await runCarryForward(data.fromYear, req.user.name);
        // Summary notification to the triggering HR admin
        res.json({
            message: `Carry-forward ${result.fromYear}→${result.toYear} complete for ${result.summary.length} employee(s).`,
            ...result
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Carry-forward failed." });
    }
});

// POST /admin/forfeiture-reminders/trigger — email + in-app warning to every
// employee currently at risk of losing annual leave at year-end. Does not
// move any balance (that only happens via the carry-forward trigger above).
router.post("/forfeiture-reminders/trigger", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        year: yup.number().integer().min(2000).max(2100).default(new Date().getFullYear())
    });
    try {
        const data = await validationSchema.validate(req.body || {}, { abortEarly: false });
        const result = await sendForfeitureReminders(req.user.name, data.year);
        res.json({
            message: result.atRisk === 0
                ? `Checked ${result.checked} employee(s) — no one is currently at risk of forfeiture.`
                : `${result.atRisk} of ${result.checked} employee(s) at risk — ${result.emailed} email(s) sent ` +
                  `(${result.byTier.critical} urgent, ${result.byTier.warning} important, ${result.byTier.notice} heads-up).`,
            ...result
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Forfeiture reminder run failed." });
    }
});

/* ================= UC-20: bulk entitlement + pro-ration ================= */

// GET /admin/entitlement/preview?year=
router.get("/entitlement/preview", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const year = Number(req.query.year) || await currentLeaveYear();
    const preview = await entitlement.previewBulkEntitlement(year);
    res.json(preview);
});

// POST /admin/entitlement/commit { year }
router.post("/entitlement/commit", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const activeYear = await currentLeaveYear();
        let validationSchema = yup.object({
            year: yup.number().integer().min(2000).max(2100).default(activeYear)
        });
        const data = await validationSchema.validate(req.body || {}, { abortEarly: false });
        const result = await entitlement.commitBulkEntitlement(data.year, req.user.name);
        res.json({ message: `Entitlements updated for ${result.updated} employee(s) in ${result.year}.`, ...result });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Commit failed." });
    }
});

// POST /admin/entitlement/prorate { fullEntitlement, startDate } — preview a pro-ration
router.post("/entitlement/prorate", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        fullEntitlement: yup.number().min(0).max(60).required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const prorated = entitlement.prorateEntitlement(data.fullEntitlement, data.startDate);
        res.json({ fullEntitlement: data.fullEntitlement, startDate: data.startDate, prorated });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

/* ================= Email delivery diagnostics (M1 support) ================= */

// GET /admin/email-status — is outgoing email configured, and does it connect?
router.get("/email-status", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const mailer = require('../services/mailer');
    const configured = mailer.smtpConfigured();
    if (!configured) {
        return res.json({
            configured: false,
            host: null,
            user: null,
            verified: false,
            message: "Email is disabled or incomplete. Set SMTP_ENABLED=true and complete the SMTP placeholders in server/.env, then restart the server."
        });
    }
    const v = await mailer.verifyTransport();
    res.json({
        configured: true,
        host: `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`,
        user: mailer.maskEmail(process.env.SMTP_USER),
        verified: v.ok,
        message: v.ok
            ? "Connected and authenticated. Password-reset and invitation emails will be delivered."
            : v.error
    });
});

// POST /admin/email-test { email } — send a real test email to prove delivery.
router.post("/email-test", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        email: yup.string().trim().lowercase().email().max(100).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const mailer = require('../services/mailer');
        if (!mailer.smtpConfigured()) {
            return res.status(400).json({
                message: "Email is disabled or incomplete. Set SMTP_ENABLED=true and complete the SMTP placeholders in server/.env, then restart the server."
            });
        }
        const result = await mailer.sendTestEmail(data.email);
        if (!result.sent) {
            return res.status(400).json({ message: result.error || "Test email failed to send." });
        }
        res.json({ message: `Test email sent to ${data.email}. Check the inbox (and the spam folder).` });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Test failed." });
    }
});


module.exports = router;
