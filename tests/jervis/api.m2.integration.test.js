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

const db = require('../../server/models');
const { User, LeaveRequest, LeaveBalance, AuditLog, PublicHoliday, BlackoutPeriod } = db;
const app = require('../../server/index');
const rules = require('../../server/services/leaveRules');
const calc = require('../../server/services/calculationService');
const { workingDaysFor } = require('../../server/services/weekendConfigService');

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
    let weiling, marcus, diana, hradmin;
    let weilingH, marcusH, dianaH, hrH;
    let holidaySet, workingDays, usedAtStart, entitledAtStart;
    // Fixtures spread across many months and roll into next year. HR would have
    // provisioned that year's balances by then, so the suite does the same and
    // removes the row again afterwards.
    let provisionedNextYear = false;
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
        hradmin = await User.findOne({ where: { email: 'hr@wypledu.online' } });
        if (!weiling || !marcus || !diana || !hradmin) throw new Error('Seed users missing — run npm run seed first');
        weilingH = authOf(weiling);
        marcusH = authOf(marcus);
        dianaH = authOf(diana);
        hrH = authOf(hradmin);

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
        const annual = await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year: YEAR() }
        });
        usedAtStart = Number(annual.used);
        entitledAtStart = Number(annual.entitled);
        // Headroom for the run. Restored in afterAll along with `used`.
        annual.entitled = Math.max(entitledAtStart, 60);
        await annual.save();

        const nextYear = await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year: YEAR() + 1 }
        });
        if (!nextYear) {
            await LeaveBalance.create({
                userId: weiling.id, leaveType: 'annual', year: YEAR() + 1,
                entitled: 60, carried: 0, used: 0
            });
            provisionedNextYear = true;
        }
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
        if (bal) {
            bal.used = usedAtStart;
            bal.entitled = entitledAtStart;
            await bal.save();
        }
        if (provisionedNextYear) {
            await LeaveBalance.destroy({
                where: { userId: weiling.id, leaveType: 'annual', year: YEAR() + 1 }
            });
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

    /* ================================================================
     * UC-03 (extended): returning early, and HR's correction of leave
     * that has already begun. One engine, two doors.
     * ============================================================= */

    // Apply, then walk it through both approval tiers, so the test starts from
    // genuinely APPROVED leave with the balance already deducted.
    const approvedLeave = async (offset, count) => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const range = workingRange(offset, count);
        const applied = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Early return fixture', ...range
        });
        // Surface WHY the fixture could not be created — a bare "expected 200,
        // got 400" sends you hunting through the feature instead of the setup.
        if (applied.status !== 200) {
            const live = await LeaveRequest.findAll({
                where: { employeeId: weiling.id },
                attributes: ['id', 'status', 'startDate', 'endDate', 'reason']
            });
            throw new Error(
                `fixture apply failed for ${range.startDate}→${range.endDate} ` +
                `(HTTP ${applied.status}): ${applied.body.message || JSON.stringify(applied.body)}\n` +
                `existing rows: ${live.map((r) => `#${r.id} ${r.status} ${r.startDate}→${r.endDate} "${r.reason}"`).join(' | ')}`
            );
        }
        await trackNew(before);
        const id = applied.body.request.id;
        expect((await request(app).put(`/leave/${id}/decide`).set(marcusH)
            .send({ approve: true })).status).toBe(200);
        expect((await request(app).put(`/leave/${id}/decide`).set(dianaH)
            .send({ approve: true, acknowledgeException: true })).status).toBe(200);
        const row = await LeaveRequest.findByPk(id);
        expect(row.status).toBe('APPROVED');
        return row;
    };

    const annualBalance = async (year) => Number((await LeaveBalance.findOne({
        where: { userId: weiling.id, leaveType: 'annual', year }
    })).used);

    // Approved leave that has already begun. /apply refuses back-dated annual
    // leave (correctly), so the row is written directly and the deduction that
    // final approval would have made is applied by hand.
    const inProgressLeave = async ({ startOffset, endOffset, days, reason }) => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const today = rules.sgtTodayISO();
        const startDate = calc.toISO(calc.addDays(calc.fromISO(today), startOffset));
        const endDate = calc.toISO(calc.addDays(calc.fromISO(today), endOffset));
        const row = await LeaveRequest.create({
            employeeId: weiling.id, leaveType: 'annual',
            startDate, endDate, days, halfDay: false,
            reason, status: 'APPROVED', flagged: false
        });
        await trackNew(before);
        const year = Number(String(startDate).slice(0, 4));
        const balance = await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year }
        });
        balance.used = Number(balance.used) + days;
        await balance.save();
        return { row, year };
    };

    test('an employee returns early: only the unused days come back, and the leave survives', async () => {
        const leave = await approvedLeave(160, 5);
        const year = Number(String(leave.startDate).slice(0, 4));
        const usedAfterApproval = await annualBalance(year);
        const originalDays = Number(leave.days);

        // Come back after the first working day of the range.
        const workDays = calc.workingDaysInRange(leave.startDate, leave.endDate, workingDays, holidaySet);
        expect(workDays.length).toBeGreaterThanOrEqual(3);
        const newEnd = workDays[1]; // keep two working days, release the rest

        const asked = await request(app).put(`/leave/${leave.id}/shorten`).set(weilingH)
            .send({ newEndDate: newEnd });
        expect(asked.status).toBe(200);
        expect(asked.body.pendingApproval).toBe(true);

        // Nothing has moved yet — it needs the same two tiers a withdrawal does.
        let row = await LeaveRequest.findByPk(leave.id);
        expect(row.status).toBe('PENDING_SUPERVISOR');
        expect(row.cancellationRequested).toBe(true);
        expect(String(row.pendingEndDate)).toBe(newEnd);
        expect(String(row.endDate)).toBe(String(leave.endDate));
        expect(await annualBalance(year)).toBeCloseTo(usedAfterApproval, 5);

        // Supervisor endorses, Manager finalises.
        expect((await request(app).put(`/leave/${leave.id}/decide`).set(marcusH)
            .send({ approve: true })).status).toBe(200);
        expect((await request(app).put(`/leave/${leave.id}/decide`).set(dianaH)
            .send({ approve: true, acknowledgeException: true })).status).toBe(200);

        row = await LeaveRequest.findByPk(leave.id);
        // The leave still exists — it is simply shorter.
        expect(row.status).toBe('APPROVED');
        expect(String(row.endDate)).toBe(newEnd);
        expect(row.pendingEndDate).toBeNull();
        expect(row.cancellationRequested).toBe(false);

        const newDays = Number(row.days);
        expect(newDays).toBeLessThan(originalDays);
        // Exactly the difference came back — not the whole leave.
        expect(await annualBalance(year)).toBeCloseTo(usedAfterApproval - (originalDays - newDays), 5);
    });

    test('a refused early return leaves the original dates and balance untouched', async () => {
        const leave = await approvedLeave(190, 5);
        const year = Number(String(leave.startDate).slice(0, 4));
        const usedAfterApproval = await annualBalance(year);
        const workDays = calc.workingDaysInRange(leave.startDate, leave.endDate, workingDays, holidaySet);

        expect((await request(app).put(`/leave/${leave.id}/shorten`).set(weilingH)
            .send({ newEndDate: workDays[1] })).status).toBe(200);

        // Supervisor says no.
        expect((await request(app).put(`/leave/${leave.id}/decide`).set(marcusH)
            .send({ approve: false, rejectionReason: 'Cover already arranged for the full week.' })).status).toBe(200);

        const row = await LeaveRequest.findByPk(leave.id);
        expect(row.status).toBe('APPROVED');
        expect(String(row.endDate)).toBe(String(leave.endDate));
        expect(row.pendingEndDate).toBeNull();
        expect(row.cancellationRequested).toBe(false);
        expect(Number(row.days)).toBe(Number(leave.days));
        expect(await annualBalance(year)).toBeCloseTo(usedAfterApproval, 5);
    });

    test('an early return is rejected when it would free no chargeable day, or remove them all', async () => {
        const leave = await approvedLeave(220, 5);
        const workDays = calc.workingDaysInRange(leave.startDate, leave.endDate, workingDays, holidaySet);

        // Same end date — nothing to shorten.
        const noop = await request(app).put(`/leave/${leave.id}/shorten`).set(weilingH)
            .send({ newEndDate: String(leave.endDate) });
        expect(noop.status).toBe(400);
        expect(noop.body.message).toMatch(/nothing to shorten/i);

        // Outside the original range.
        const outside = await request(app).put(`/leave/${leave.id}/shorten`).set(weilingH)
            .send({ newEndDate: '2099-01-01' });
        expect(outside.status).toBe(400);
        expect(outside.body.message).toMatch(/inside the original leave/i);

        // Keeping only the first working day is a shortening; keeping none is a
        // withdrawal, and the route says so instead of silently cancelling.
        const dayBefore = calc.toISO(calc.addDays(calc.fromISO(workDays[0]), -1));
        if (dayBefore >= String(leave.startDate)) {
            const wipesAll = await request(app).put(`/leave/${leave.id}/shorten`).set(weilingH)
                .send({ newEndDate: dayBefore });
            expect(wipesAll.status).toBe(400);
            expect(wipesAll.body.message).toMatch(/whole leave|no chargeable/i);
        }
    });

    test('only the owner can shorten their leave', async () => {
        const leave = await approvedLeave(250, 5);
        const workDays = calc.workingDaysInRange(leave.startDate, leave.endDate, workingDays, holidaySet);
        const asSomeoneElse = await request(app).put(`/leave/${leave.id}/shorten`).set(marcusH)
            .send({ newEndDate: workDays[1] });
        expect(asSomeoneElse.status).toBe(403);
    });

    test('HR adjusts leave that has already started — the case the employee route sends them for', async () => {
        // Leave that is genuinely under way, with its days already deducted.
        const { row: created, year } = await inProgressLeave({
            startOffset: -3, endOffset: 3, days: 4, reason: 'In-progress fixture'
        });
        const usedBefore = await annualBalance(year);

        // The employee is turned away and pointed at HR.
        const refused = await request(app).put(`/leave/${created.id}/shorten`).set(weilingH)
            .send({ newEndDate: rules.sgtTodayISO() });
        expect(refused.status).toBe(400);
        expect(refused.body.message).toMatch(/already started/i);
        expect(refused.body.message).toMatch(/HR/);

        // A non-HR user cannot use the HR door either.
        expect((await request(app).put(`/leave/${created.id}/hr-adjust`).set(marcusH)
            .send({ newEndDate: rules.sgtTodayISO(), reason: 'Trying it on' })).status).toBe(403);

        // HR shortens it immediately — no approval chain.
        const adjusted = await request(app).put(`/leave/${created.id}/hr-adjust`).set(hrH)
            .send({ newEndDate: rules.sgtTodayISO(), reason: 'Employee returned to the office early.' });
        expect(adjusted.status).toBe(200);
        expect(adjusted.body.daysRestored).toBeGreaterThan(0);

        const row = await LeaveRequest.findByPk(created.id);
        expect(row.status).toBe('APPROVED');
        expect(String(row.endDate)).toBe(rules.sgtTodayISO());
        expect(await annualBalance(year)).toBeCloseTo(usedBefore - adjusted.body.daysRestored, 5);

        // And it is on the record, with the reason.
        const trail = await AuditLog.findAll({ where: { requestId: created.id } });
        expect(trail.some((a) => /Adjusted by HR/.test(a.action))).toBe(true);
        expect(trail.some((a) => /returned to the office early/i.test(a.action))).toBe(true);
    });

    test('HR must give a reason, and cannot adjust leave that is not approved', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const pending = await request(app).post('/leave/apply').set(weilingH).send({
            leaveType: 'annual', halfDay: false, reason: 'Not yet approved', ...workingRange(280)
        });
        await trackNew(before);
        const id = pending.body.request.id;

        const noReason = await request(app).put(`/leave/${id}/hr-adjust`).set(hrH)
            .send({ newEndDate: String(pending.body.request.startDate) });
        expect(noReason.status).toBe(400);

        const notApproved = await request(app).put(`/leave/${id}/hr-adjust`).set(hrH)
            .send({ newEndDate: String(pending.body.request.startDate), reason: 'Should not apply' });
        expect(notApproved.status).toBe(400);
        expect(notApproved.body.message).toMatch(/only approved leave/i);
    });

    test('HR can void an in-progress leave outright and the full balance returns', async () => {
        const { row: created, year } = await inProgressLeave({
            startOffset: -2, endOffset: 2, days: 3, reason: 'Void fixture'
        });
        const usedBefore = await annualBalance(year);
        expect(usedBefore).toBeGreaterThanOrEqual(3); // the deduction is really there

        const voided = await request(app).put(`/leave/${created.id}/hr-adjust`).set(hrH)
            .send({ cancelEntirely: true, reason: 'Recorded against the wrong employee.' });
        expect(voided.status).toBe(200);

        const row = await LeaveRequest.findByPk(created.id);
        expect(row.status).toBe('CANCELLED');
        expect(await annualBalance(year)).toBeCloseTo(usedBefore - 3, 5);
    });

    /* ---------------- UC-13 (extended): certificates HR still needs ---------------- */

    test('the MC compliance list flags long self-declared sick leave, and only for HR', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const longRange = workingRange(300, rules.MC_REQUIRED_AFTER_DAYS + 2);
        const created = await LeaveRequest.create({
            employeeId: weiling.id, leaveType: 'sick_nomc',
            startDate: longRange.startDate, endDate: longRange.endDate,
            days: rules.MC_REQUIRED_AFTER_DAYS + 2, halfDay: false,
            reason: 'Long self-declared absence', status: 'APPROVED', flagged: false
        });
        await trackNew(before);

        // Employees and approvers have no business with this list.
        expect((await request(app).get('/leave/mc-compliance').set(weilingH)).status).toBe(403);
        expect((await request(app).get('/leave/mc-compliance').set(marcusH)).status).toBe(403);

        const res = await request(app).get('/leave/mc-compliance').set(hrH);
        expect(res.status).toBe(200);
        expect(res.body.selfDeclarationLimit).toBe(rules.MC_REQUIRED_AFTER_DAYS);
        const hit = res.body.outstanding.find((o) => o.id === created.id);
        expect(hit).toBeTruthy();
        expect(hit.reason).toBe('EXCEEDS_SELF_DECLARATION');
        expect(hit.employee.name).toBe(weiling.name);
        // The document itself is never served here.
        expect(JSON.stringify(res.body)).not.toMatch(/attachmentData|base64/);
    });

    test('a short self-declared absence is not chased', async () => {
        const before = (await LeaveRequest.findAll({ where: { employeeId: weiling.id } })).map((r) => r.id);
        const shortRange = workingRange(330, 1);
        const created = await LeaveRequest.create({
            employeeId: weiling.id, leaveType: 'sick_nomc',
            startDate: shortRange.startDate, endDate: shortRange.endDate,
            days: 1, halfDay: false, reason: 'One day off sick',
            status: 'APPROVED', flagged: false
        });
        await trackNew(before);

        const res = await request(app).get('/leave/mc-compliance').set(hrH);
        expect(res.body.outstanding.find((o) => o.id === created.id)).toBeUndefined();
    });
});
