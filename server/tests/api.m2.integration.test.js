/**
 * M2 (Employee Leave Experience) API integration tests.
 * Runs against the real MySQL from .env — run `npm run seed` first.
 *
 * Tokens are signed directly with APP_SECRET (the same payload POST /user/login
 * issues) so these tests exercise M2's endpoints without walking M1's mandatory
 * two-step verification flow.
 */
const request = require('supertest');
const { sign } = require('jsonwebtoken');
require('dotenv').config();

const db = require('../models');
const { User, LeaveRequest, LeaveBalance, AuditLog, PublicHoliday, BlackoutPeriod } = db;
const app = require('../index');
const rules = require('../services/leaveRules');
const calc = require('../services/calculationService');
const { workingDaysFor } = require('../services/weekendConfigService');

const tokenFor = (u) => sign(
    { id: u.id, email: u.email, name: u.name, role: u.role, country: u.country, team: u.team, initials: u.initials },
    process.env.APP_SECRET,
    { expiresIn: process.env.TOKEN_EXPIRES_IN || "8h" }
);
const authOf = (u) => ({ Authorization: `Bearer ${tokenFor(u)}` });

const plusDays = (n) => {
    const d = new Date(`${rules.sgtTodayISO()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const YEAR = () => Number(rules.sgtTodayISO().slice(0, 4));

describe('M2 API integration — leave lifecycle', () => {
    let weiling, marcus, diana;
    let weilingH, marcusH, dianaH;
    let holidaySet, workingDays, usedAtStart;
    let blackoutDates = new Set();
    const createdRequestIds = [];

    // Fixture dates must fall on the employee's own working days, so ask M4's
    // calculation service instead of guessing weekday offsets (a fixed "+100
    // days" can land on a public holiday and fail for the wrong reason).
    // They must also avoid M4's seeded blackout windows (UC-18) — a BLOCKed
    // range is refused by /apply, which would fail these tests for a reason
    // that has nothing to do with what they are actually asserting.
    const isBlackedOut = (iso) => blackoutDates.has(iso);
    const nextWorkingDay = (fromISO) => {
        let iso = fromISO;
        while (calc.computeDays(iso, iso, false, workingDays, holidaySet) === 0 || isBlackedOut(iso)) {
            iso = calc.toISO(calc.addDays(calc.fromISO(iso), 1));
        }
        return iso;
    };
    // A range starting on a working day that contains exactly `count` of them,
    // and touches no blackout date anywhere in between.
    const workingRange = (offset, count = 1) => {
        let start = nextWorkingDay(plusDays(offset));
        for (;;) {
            let end = start;
            while (calc.workingDaysInRange(start, end, workingDays, holidaySet).length < count) {
                end = calc.toISO(calc.addDays(calc.fromISO(end), 1));
            }
            const spans = [];
            for (let d = calc.fromISO(start); calc.toISO(d) <= end; d = calc.addDays(d, 1)) {
                spans.push(calc.toISO(d));
            }
            if (!spans.some(isBlackedOut)) return { startDate: start, endDate: end };
            // Restart after the blackout window rather than nudging one day at
            // a time into the middle of it.
            start = nextWorkingDay(calc.toISO(calc.addDays(calc.fromISO(end), 1)));
        }
    };

    const trackNew = async (before) => {
        const rows = await LeaveRequest.findAll({ where: { employeeId: weiling.id } });
        rows.filter((r) => !before.includes(r.id)).forEach((r) => createdRequestIds.push(r.id));
    };

    // sync({ alter: true }) inspects and reconciles every table, which takes
    // well over Jest's 5s default on a populated database — the hook was timing
    // out before a single test ran.
    jest.setTimeout(60000);

    beforeAll(async () => {
        await db.sequelize.sync({ alter: true });
        weiling = await User.findOne({ where: { email: 'weiling@wypledu.online' } });
        marcus = await User.findOne({ where: { email: 'marcus@wypledu.online' } });
        diana = await User.findOne({ where: { email: 'diana@wypledu.online' } });
        if (!weiling || !marcus || !diana) throw new Error('Seed users missing — run npm run seed first');
        weilingH = authOf(weiling);
        marcusH = authOf(marcus);
        dianaH = authOf(diana);

        holidaySet = new Set((await PublicHoliday.findAll({ where: { country: weiling.country } })).map((h) => h.date));
        workingDays = await workingDaysFor(weiling.country);

        // M4 (UC-18): every date inside an active blackout window that could
        // apply to this employee, so fixtures can steer clear of them.
        blackoutDates = new Set();
        for (const b of await BlackoutPeriod.findAll({ where: { active: true } })) {
            if (b.country && b.country !== weiling.country) continue;
            if (b.team && b.team !== weiling.team) continue;
            for (let d = calc.fromISO(b.startDate); calc.toISO(d) <= b.endDate; d = calc.addDays(d, 1)) {
                blackoutDates.add(calc.toISO(d));
            }
        }

        // Make sure the employee has room to apply in the current year.
        const bal = await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year: YEAR() }
        });
        if (!bal) {
            await LeaveBalance.create({
                userId: weiling.id, leaveType: 'annual', year: YEAR(),
                entitled: 14, carried: 0, used: 0
            });
        }
        usedAtStart = Number((await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year: YEAR() }
        })).used);
    });

    afterAll(async () => {
        for (const id of createdRequestIds) {
            await AuditLog.destroy({ where: { requestId: id } });
            await LeaveRequest.destroy({ where: { id } });
        }
        // Leave the seed balance exactly as we found it (fixtures that were
        // approved during the run had deducted days).
        const bal = await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year: YEAR() }
        });
        if (bal && Number(bal.used) !== usedAtStart) {
            bal.used = usedAtStart;
            await bal.save();
        }
        await db.sequelize.close();
    });

    /* ---------------- UC-14: forecast ---------------- */

    test('POST /leave/forecast returns days, skipped days and the projected balance', async () => {
        const res = await request(app).post('/leave/forecast').set(weilingH).send({
            leaveType: 'annual', halfDay: false, ...workingRange(30, 5)
        });
        expect(res.status).toBe(200);
        expect(typeof res.body.days).toBe('number');
        expect(Array.isArray(res.body.workDays)).toBe(true);
        expect(Array.isArray(res.body.skipped)).toBe(true);
        expect(res.body.balance).toHaveProperty('remainingBefore');
        expect(res.body.balance).toHaveProperty('remainingAfter');
        expect(res.body.balance.remainingAfter)
            .toBeCloseTo(res.body.balance.remainingBefore - res.body.days, 5);
        // Nothing was persisted by a forecast.
        const drafts = await LeaveRequest.count({ where: { employeeId: weiling.id, status: 'DRAFT' } });
        expect(typeof drafts).toBe('number');
    });

    test('forecast warns instead of failing when the range is back-dated', async () => {
        const res = await request(app).post('/leave/forecast').set(weilingH).send({
            leaveType: 'annual', startDate: plusDays(-5), endDate: plusDays(-5), halfDay: false
        });
        expect(res.status).toBe(200);
        expect(res.body.warnings.join(' ')).toMatch(/past/i);
    });

    /* ---------------- UC-01: apply guards ---------------- */

    test('annual leave cannot be back-dated', async () => {
        const res = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', startDate: plusDays(-3), endDate: plusDays(-3),
            halfDay: false, reason: 'Back-dated attempt'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/past/i);
    });

    test('an MC must be a PDF/JPG/PNG', async () => {
        const res = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'sick_mc', ...workingRange(1),
            halfDay: false, reason: 'Clinic visit',
            attachmentName: 'mc.zip', attachmentType: 'application/zip',
            attachmentData: 'data:application/zip;base64,AAAA'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/PDF/);
    });

    test('a second request on the same dates is rejected as a double booking', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const first = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Overlap fixture', ...workingRange(40)
        });
        expect(first.status).toBe(200);
        await trackNew(before);

        const second = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Should clash', ...workingRange(40)
        });
        expect(second.status).toBe(400);
        expect(second.body.message).toMatch(/already have leave/i);
        await trackNew(before);
    });

    /* ---------------- UC-14: drafts recompute days ---------------- */

    test('editing a draft recomputes its day count', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const created = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Draft fixture', isDraft: true, ...workingRange(60)
        });
        expect(created.status).toBe(200);
        await trackNew(before);
        const draftId = created.body.request.id;
        const oneDay = Number(created.body.request.days);

        const edited = await request(app).put(`/leave/drafts/${draftId}`).set(weilingH).send({
            ...workingRange(60, 5)
        });
        expect(edited.status).toBe(200);
        expect(Number(edited.body.days)).toBeGreaterThan(oneDay);
    });

    /* ---------------- UC-03: cancellation of APPROVED leave ---------------- */

    test('approved leave is withdrawn through the two-tier chain and the balance is restored', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);

        // 1. apply
        const applied = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Cancellation flow fixture', ...workingRange(80)
        });
        expect(applied.status).toBe(200);
        await trackNew(before);
        const id = applied.body.request.id;
        const days = Number(applied.body.request.days);
        const year = Number(String(applied.body.request.startDate).slice(0, 4));

        const balanceRow = () => LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year }
        });
        const usedBeforeApproval = Number((await balanceRow()).used);

        // 2. Supervisor endorses, Manager approves → balance deducted
        expect((await request(app).put(`/leave/${id}/decide`).set(marcusH)
            .send({ approve: true })).status).toBe(200);
        expect((await request(app).put(`/leave/${id}/decide`).set(dianaH)
            .send({ approve: true, acknowledgeException: true })).status).toBe(200);
        expect(Number((await balanceRow()).used)).toBeCloseTo(usedBeforeApproval + days, 5);

        // 3. Employee asks to cancel → NOT cancelled yet, routed for approval
        const cancel = await request(app).put(`/leave/${id}/cancel`).set(weilingH);
        expect(cancel.status).toBe(200);
        expect(cancel.body.cancelled).toBe(false);
        expect(cancel.body.pendingApproval).toBe(true);
        let row = await LeaveRequest.findByPk(id);
        expect(row.status).toBe('PENDING_SUPERVISOR');
        expect(row.cancellationRequested).toBe(true);
        // Balance is untouched until the withdrawal is approved.
        expect(Number((await balanceRow()).used)).toBeCloseTo(usedBeforeApproval + days, 5);

        // 4. Supervisor refuses the cancellation → the leave stands
        expect((await request(app).put(`/leave/${id}/decide`).set(marcusH)
            .send({ approve: false, rejectionReason: 'Coverage already arranged' })).status).toBe(200);
        row = await LeaveRequest.findByPk(id);
        expect(row.status).toBe('APPROVED');
        expect(row.cancellationRequested).toBe(false);
        expect(Number((await balanceRow()).used)).toBeCloseTo(usedBeforeApproval + days, 5);

        // 5. Ask again, this time both tiers approve → CANCELLED + days restored
        expect((await request(app).put(`/leave/${id}/cancel`).set(weilingH)).status).toBe(200);
        expect((await request(app).put(`/leave/${id}/decide`).set(marcusH)
            .send({ approve: true })).status).toBe(200);
        expect((await request(app).put(`/leave/${id}/decide`).set(dianaH)
            .send({ approve: true })).status).toBe(200);

        row = await LeaveRequest.findByPk(id);
        expect(row.status).toBe('CANCELLED');
        expect(row.cancellationRequested).toBe(false);
        expect(Number((await balanceRow()).used)).toBeCloseTo(usedBeforeApproval, 5);
    });

    test('a pending request is still cancelled immediately', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const applied = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Immediate cancel fixture', ...workingRange(100)
        });
        expect(applied.status).toBe(200);
        await trackNew(before);

        const res = await request(app).put(`/leave/${applied.body.request.id}/cancel`).set(weilingH);
        expect(res.status).toBe(200);
        expect(res.body.cancelled).toBe(true);
        expect((await LeaveRequest.findByPk(applied.body.request.id)).status).toBe('CANCELLED');
    });

    /* ---------------- UC-14: .ics export ---------------- */

    test('GET /leave/:id/ics refuses a request that is not approved, and is owner-only', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const applied = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'ICS fixture', ...workingRange(120)
        });
        expect(applied.status).toBe(200);
        await trackNew(before);
        const id = applied.body.request.id;

        const pending = await request(app).get(`/leave/${id}/ics`).set(weilingH);
        expect(pending.status).toBe(400);

        const notOwner = await request(app).get(`/leave/${id}/ics`).set(marcusH);
        expect(notOwner.status).toBe(403);

        // Approve it, then the owner can download a calendar file.
        await request(app).put(`/leave/${id}/decide`).set(marcusH).send({ approve: true });
        await request(app).put(`/leave/${id}/decide`).set(dianaH)
            .send({ approve: true, acknowledgeException: true });

        const ok = await request(app).get(`/leave/${id}/ics`).set(weilingH);
        expect(ok.status).toBe(200);
        expect(ok.headers['content-type']).toMatch(/text\/calendar/);
        expect(ok.text).toContain('BEGIN:VCALENDAR');
        expect(ok.text).toContain(`UID:leave-${id}@innovare-lms`);
    });
});
