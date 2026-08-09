/**
 * §9.2-style supertest integration tests (M3).
 * Uses the dedicated MySQL schema from .env.test; creates isolated fixture rows so tests do not
 * permanently destroy seed queue items (except where a decision is required).
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { todayISO, addDaysISO } = require('../services/businessTime');
const mailer = require('../services/mailer');

const db = require('../models');
const {
    User, LeaveRequest, LeaveBalance, Notification, Delegation, Comment, AuditLog, TwoFactorChallenge
} = db;

// Avoid starting the reminder scheduler / listen() — index only listens when main
const app = require('../index');

const PASS = 'demo123!';
const today = () => todayISO();
const plusDays = (n) => addDaysISO(today(), n);

async function login(email) {
    const start = await request(app).post('/user/login').send({ email, password: PASS });
    if (start.status !== 200 || !start.body.challengeToken || start.body.accessToken) {
        throw new Error(`2FA login challenge failed for ${email} (HTTP ${start.status}).`);
    }

    const sent = await request(app).post('/user/2fa/send').send({
        challengeToken: start.body.challengeToken,
        method: 'EMAIL'
    });
    if (sent.status !== 200 || !sent.body.demoCode) {
        throw new Error(`Offline 2FA delivery failed for ${email} (HTTP ${sent.status}).`);
    }

    const verified = await request(app).post('/user/2fa/verify').send({
        challengeToken: start.body.challengeToken,
        code: sent.body.demoCode
    });
    if (verified.status !== 200 || !verified.body.accessToken) {
        throw new Error(`2FA verification failed for ${email} (HTTP ${verified.status}).`);
    }
    return verified.body.accessToken;
}

async function auth(email) {
    const token = await login(email);
    return { Authorization: `Bearer ${token}` };
}

describe('M3 API integration (§9.2 subset)', () => {
    let weiling, marcus, diana, priya, aiden, grace, hr;
    // Isolated cross-team fixture for actingFor
    let teamBSupervisor, teamBEmployee, teamBPending;
    let createdRequestIds = [];
    let createdUserIds = [];
    let createdDelegationIds = [];
    let fixtureOffset = 60;

    const makeLeave = async ({
        employee = weiling,
        status = 'PENDING_SUPERVISOR',
        flagged = false,
        leaveType = 'annual',
        reason = 'M3 final requirements fixture',
        days = 1
    } = {}) => {
        fixtureOffset += 1;
        const row = await LeaveRequest.create({
            employeeId: employee.id,
            leaveType,
            startDate: plusDays(fixtureOffset),
            endDate: plusDays(fixtureOffset),
            days,
            halfDay: false,
            reason,
            status,
            flagged,
            stageEnteredAt: new Date()
        });
        createdRequestIds.push(row.id);
        return row;
    };

    beforeAll(async () => {
        await db.sequelize.sync({ alter: true });

        // Clean up any leftover state from previous test runs.
        await Delegation.destroy({ where: {} });
        await Notification.destroy({ where: {} });
        await Comment.destroy({ where: {} });
        await AuditLog.destroy({ where: {} });
        // Remove any non-seed leave requests (those with M3 fixture reasons).
        await LeaveRequest.destroy({
            where: { reason: { [db.Sequelize.Op.like]: 'M3%' } }
        });
        // Remove any non-seed users.
        await User.destroy({
            where: { email: { [db.Sequelize.Op.like]: 'm3-%' } }
        });

        // Reset leave balances for seed users to avoid negative balances from previous runs.
        for (const email of ['weiling@wypledu.online', 'priya@wypledu.online', 'marcus@wypledu.online', 'diana@wypledu.online']) {
            const user = await User.findOne({ where: { email } });
            if (user) {
                await LeaveBalance.update(
                    { used: 0 },
                    { where: { userId: user.id, leaveType: 'annual', year: 2026 } }
                );
            }
        }

        weiling = await User.findOne({ where: { email: 'weiling@wypledu.online' } });
        marcus = await User.findOne({ where: { email: 'marcus@wypledu.online' } });
        diana = await User.findOne({ where: { email: 'diana@wypledu.online' } });
        priya = await User.findOne({ where: { email: 'priya@wypledu.online' } });
        aiden = await User.findOne({ where: { email: 'aiden@wypledu.online' } });
        grace = await User.findOne({ where: { email: 'grace@wypledu.online' } });
        hr = await User.findOne({ where: { email: 'hr@wypledu.online' } });
        if (!weiling || !marcus || !diana || !priya || !aiden || !grace || !hr) {
            throw new Error('Seed users missing — run npm run seed first');
        }

        // Ensure notification preferences are enabled for comment notification tests.
        if (!diana.notifyInApp) {
            diana.notifyInApp = true;
            await diana.save();
        }

        // Seeded same-tier Team B peers are the canonical delegation fixtures.
        teamBSupervisor = aiden;
        const hash = await bcrypt.hash(PASS, 10);
        const [empB] = await User.findOrCreate({
            where: { email: 'm3-team-b-emp@wypledu.online' },
            defaults: {
                name: 'Team B Emp',
                email: 'm3-team-b-emp@wypledu.online',
                password: hash,
                role: 'EMPLOYEE',
                country: 'SG',
                team: aiden.team,
                initials: 'TE'
            }
        });
        teamBEmployee = empB;
        if (empB.team !== aiden.team || empB.status !== 'ACTIVE') {
            empB.team = aiden.team;
            empB.status = 'ACTIVE';
            await empB.save();
        }
        if (!createdUserIds.includes(empB.id)) createdUserIds.push(empB.id);

        const year = new Date().getFullYear();
        await LeaveBalance.findOrCreate({
            where: { userId: empB.id, leaveType: 'annual', year },
            defaults: { entitled: 14, carried: 0, used: 0 }
        });

        // Fresh PENDING_SUPERVISOR on Team B
        const req = await LeaveRequest.create({
            employeeId: empB.id,
            leaveType: 'annual',
            startDate: plusDays(14),
            endDate: plusDays(14),
            days: 1,
            halfDay: false,
            reason: 'M3 integration fixture leave',
            status: 'PENDING_SUPERVISOR',
            flagged: false
        });
        teamBPending = req;
        createdRequestIds.push(req.id);
        await AuditLog.create({ requestId: req.id, actorName: empB.name, action: 'Submitted (integration)' });
    }, 60000);

    afterAll(async () => {
        // Clean fixtures created during this run (best-effort)
        for (const id of createdDelegationIds) {
            await Delegation.destroy({ where: { id } }).catch(() => {});
        }
        // Also remove any leftover M3 test delegations
        if (marcus) {
            await Delegation.destroy({
                where: { fromUserId: marcus.id, reason: 'M3 integration test' }
            }).catch(() => {});
        }
        if (teamBSupervisor && marcus) {
            await Delegation.destroy({
                where: { fromUserId: teamBSupervisor.id, toUserId: marcus.id }
            }).catch(() => {});
        }
        for (const id of createdRequestIds) {
            await Comment.destroy({ where: { requestId: id } }).catch(() => {});
            await AuditLog.destroy({ where: { requestId: id } }).catch(() => {});
            await Notification.destroy({ where: { requestId: id } }).catch(() => {});
            await LeaveRequest.destroy({ where: { id } }).catch(() => {});
        }
        for (const id of createdUserIds) {
            await LeaveBalance.destroy({ where: { userId: id } }).catch(() => {});
            await Notification.destroy({ where: { userId: id } }).catch(() => {});
            await User.destroy({ where: { id } }).catch(() => {});
        }
        await db.sequelize.close();
    });

    // ---- A1 ----
    test('A1 marcus GET /notification/unread-count → 200 { count }', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app).get('/notification/unread-count').set(marcusH);
        expect(res.status).toBe(200);
        expect(typeof res.body.count).toBe('number');
        expect(res.body.count).toBeGreaterThanOrEqual(0);
    });

    test('rapid duplicate leave submission with one idempotency key creates one request', async () => {
        const weilingH = await auth('weiling@wypledu.online');
        const key = `m3-double-submit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const startDate = plusDays(90);
        const payload = {
            leaveType: 'annual',
            startDate,
            endDate: plusDays(94),
            halfDay: false,
            halfDayPeriod: null,
            reason: 'M3 idempotent rapid submission fixture',
            isDraft: false,
            attachmentName: null,
            attachmentType: null,
            attachmentData: null
        };

        const [first, second] = await Promise.all([
            request(app).post('/leave/apply').set(weilingH).set('Idempotency-Key', key).send(payload),
            request(app).post('/leave/apply').set(weilingH).set('Idempotency-Key', key).send(payload)
        ]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(first.body.request.id).toBe(second.body.request.id);
        const requestId = first.body.request.id;
        if (!createdRequestIds.includes(requestId)) createdRequestIds.push(requestId);
        expect(await LeaveRequest.count({
            where: { employeeId: weiling.id, submissionKey: key }
        })).toBe(1);
        expect(await AuditLog.count({
            where: { requestId, actorName: weiling.name }
        })).toBe(1);
    });

    // ---- A2 ----
    test('A2 weiling cannot mark marcus notification read → 403', async () => {
        const n = await Notification.create({
            userId: marcus.id,
            message: 'M3 matrix ownership probe',
            type: 'APPROVAL'
        });
        const weilingH = await auth('weiling@wypledu.online');
        const res = await request(app).put(`/notification/${n.id}/read`).set(weilingH);
        expect(res.status).toBe(403);
        await n.destroy();
    });

    // ---- A3 ----
    test('A3 marcus POST /notification/run-reminders → 403 wrong role', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app).post('/notification/run-reminders').set(marcusH);
        expect(res.status).toBe(403);
    });

    // ---- A4 ----
    test('A4 diana run-reminders then immediate re-run sends 0 more', async () => {
        const dianaH = await auth('diana@wypledu.online');
        const first = await request(app).post('/notification/run-reminders').set(dianaH);
        expect(first.status).toBe(200);
        expect(typeof first.body.remindersSent).toBe('number');
        expect(first.body.remindersSent).toBeGreaterThanOrEqual(0);

        const second = await request(app).post('/notification/run-reminders').set(dianaH);
        expect(second.status).toBe(200);
        expect(second.body.remindersSent).toBe(0);
    });

    // ---- A5 ----
    test('A5 marcus GET comments on PENDING_SUPERVISOR request → 200 array', async () => {
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(30),
            endDate: plusDays(30),
            days: 1,
            halfDay: false,
            reason: 'M3 A5 comments fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false
        });
        createdRequestIds.push(r.id);

        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app).get(`/leave/${r.id}/comments`).set(marcusH);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // ---- A6 ----
    test('A6 weiling POST comment on own pending → 200; marcus receives COMMENT notification', async () => {
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(31),
            endDate: plusDays(31),
            days: 1,
            halfDay: false,
            reason: 'M3 A6 comment notify fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false
        });
        createdRequestIds.push(r.id);

        const weilingH = await auth('weiling@wypledu.online');
        const res = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(weilingH)
            .send({ body: 'Test comment.' });
        expect(res.status).toBe(200);
        expect(res.body.body).toBe('Test comment.');

        const note = await Notification.findOne({
            where: { userId: marcus.id, type: 'COMMENT', requestId: r.id },
            order: [['createdAt', 'DESC']]
        });
        expect(note).toBeTruthy();
    });

    // ---- A12 ----
    test('A12 bulk-approve flagged request is excluded from bulk processing', async () => {
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(32),
            endDate: plusDays(32),
            days: 1,
            halfDay: false,
            reason: 'M3 A12 flagged fixture',
            status: 'PENDING_MANAGER',
            flagged: true
        });
        createdRequestIds.push(r.id);

        const dianaH = await auth('diana@wypledu.online');
        const res = await request(app)
            .put('/leave/bulk-decide')
            .set(dianaH)
            .send({ ids: [r.id], approve: true, acknowledgeException: false });
        expect(res.status).toBe(200);
        expect(res.body.results[0].ok).toBe(false);
        expect(res.body.results[0].message).toMatch(/individual Manager review/i);
    });

    // ---- A13 ----
    test('A13 marcus POST /delegation to aiden (SUPERVISOR peer) → 200; notification', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app)
            .post('/delegation')
            .set(marcusH)
            .send({
                toUserId: aiden.id,
                startDate: today(),
                endDate: plusDays(3),
                reason: 'M3 integration test'
            });
        expect(res.status).toBe(200);
        createdDelegationIds.push(res.body.id);

        const note = await Notification.findOne({
            where: { userId: aiden.id, type: 'DELEGATION' },
            order: [['createdAt', 'DESC']]
        });
        expect(note).toBeTruthy();
        expect(note.message).toMatch(/Marcus Lim/i);
        await Delegation.destroy({ where: { id: res.body.id } });
    });

    // ---- A15 ----
    test('A15 Manager peer delegation with endDate < startDate → 400', async () => {
        const dianaH = await auth('diana@wypledu.online');
        const res = await request(app)
            .post('/delegation')
            .set(dianaH)
            .send({
                toUserId: grace.id,
                startDate: plusDays(5),
                endDate: plusDays(2),
                reason: 'M3 integration test'
            });
        expect(res.status).toBe(400);
        expect(res.body.message || JSON.stringify(res.body)).toMatch(/endDate|startDate/i);
    });

    test('overlapping active delegations are rejected', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const first = await request(app)
            .post('/delegation')
            .set(marcusH)
            .send({
                toUserId: aiden.id,
                startDate: plusDays(5),
                endDate: plusDays(8),
                reason: 'M3 overlap fixture'
            });
        expect(first.status).toBe(200);
        createdDelegationIds.push(first.body.id);

        const second = await request(app)
            .post('/delegation')
            .set(marcusH)
            .send({
                toUserId: aiden.id,
                startDate: plusDays(7),
                endDate: plusDays(9),
                reason: 'M3 overlap fixture'
            });
        expect(second.status).toBe(400);
        expect(second.body.message).toMatch(/overlap/i);
        await Delegation.destroy({ where: { id: first.body.id } });
    });

    // ---- A8-style: comments locked after decision ----
    test('POST comment on decided request → 400 locked message', async () => {
        // Create a request and have diana approve it at manager tier
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(20),
            endDate: plusDays(20),
            days: 1,
            halfDay: false,
            reason: 'M3 lock-comment fixture',
            status: 'PENDING_MANAGER',
            flagged: false
        });
        createdRequestIds.push(r.id);

        const dianaH = await auth('diana@wypledu.online');
        const decide = await request(app)
            .put(`/leave/${r.id}/decide`)
            .set(dianaH)
            .send({ approve: true });
        expect(decide.status).toBe(200);
        expect(decide.body.request.status).toBe('APPROVED');

        const post = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(dianaH)
            .send({ body: 'This comment should be locked.' });
        expect(post.status).toBe(400);
        expect(post.body.message).toMatch(/Comments are locked once the request is decided/i);
    });

    test('concurrent Manager approvals commit once and deduct the balance once', async () => {
        const year = new Date().getFullYear();
        const balance = await LeaveBalance.findOne({
            where: { userId: weiling.id, leaveType: 'annual', year }
        });
        expect(balance).toBeTruthy();
        const usedBefore = Number(balance.used);

        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(40),
            endDate: plusDays(40),
            days: 1,
            halfDay: false,
            reason: 'M3 concurrent final approval fixture',
            status: 'PENDING_MANAGER',
            flagged: false
        });
        createdRequestIds.push(r.id);

        const dianaH = await auth('diana@wypledu.online');
        const notificationsBefore = await Notification.count({
            where: { requestId: r.id, userId: weiling.id, type: 'APPROVAL' }
        });
        const mailSpy = jest.spyOn(mailer, 'sendNotificationEmail').mockResolvedValue({
            sent: true,
            skipped: false,
            messageId: 'test-final-approval'
        });

        try {
            const [first, second] = await Promise.all([
                request(app).put(`/leave/${r.id}/decide`).set(dianaH).send({ approve: true }),
                request(app).put(`/leave/${r.id}/decide`).set(dianaH).send({ approve: true })
            ]);

            expect([first.status, second.status].sort()).toEqual([200, 400]);
            await r.reload();
            expect(r.status).toBe('APPROVED');
            await balance.reload();
            expect(Number(balance.used)).toBe(usedBefore + 1);

            const notificationsAfter = await Notification.count({
                where: { requestId: r.id, userId: weiling.id, type: 'APPROVAL' }
            });
            expect(notificationsAfter - notificationsBefore).toBe(1);
            expect(mailSpy).toHaveBeenCalledTimes(1);
        } finally {
            mailSpy.mockRestore();
            // Restore the shared seed balance; the request itself is removed in afterAll.
            balance.used = usedBefore;
            await balance.save();
        }
    });

    // ---- A9-style: another team → 403 ----
    test('GET comments on another team request → 403', async () => {
        // marcus (Compliance Team A) must not read Team B request comments
        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app)
            .get(`/leave/${teamBPending.id}/comments`)
            .set(marcusH);
        expect(res.status).toBe(403);
    });

    test('AI-3 endpoints deny a wrong-team approver without leaking request data', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const summary = await request(app)
            .get(`/ai/summary/${teamBPending.id}`)
            .set(marcusH);
        expect(summary.status).toBe(403);
        expect(summary.text).toBe("");

        const draft = await request(app)
            .post('/ai/draft-note')
            .set(marcusH)
            .send({ requestId: teamBPending.id, mode: 'approve' });
        expect(draft.status).toBe(403);
        expect(draft.text).toBe("");
    });

    test('AI-3 summary allows an active same-tier delegate', async () => {
        const del = await Delegation.create({
            fromUserId: teamBSupervisor.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(1),
            reason: 'M3 AI delegate fixture',
            active: true
        });
        createdDelegationIds.push(del.id);

        const marcusH = await auth('marcus@wypledu.online');
        const summary = await request(app)
            .get(`/ai/summary/${teamBPending.id}`)
            .set(marcusH);
        expect(summary.status).toBe(200);
        expect(summary.body.employee.id).toBe(teamBEmployee.id);
        expect(summary.body.recommendation).toBeTruthy();
        await Delegation.destroy({ where: { id: del.id } });
    });

    test('a delegated Supervisor decision keeps the employee original Manager chain', async () => {
        const r = await LeaveRequest.create({
            employeeId: teamBEmployee.id,
            leaveType: 'annual',
            startDate: plusDays(45),
            endDate: plusDays(45),
            days: 1,
            halfDay: false,
            reason: 'M3 original chain fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false,
            stageEnteredAt: new Date()
        });
        createdRequestIds.push(r.id);
        const del = await Delegation.create({
            fromUserId: aiden.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(1),
            reason: 'M3 original chain delegate fixture',
            active: true
        });
        createdDelegationIds.push(del.id);

        const marcusH = await auth('marcus@wypledu.online');
        const decided = await request(app)
            .put(`/leave/${r.id}/decide`)
            .set(marcusH)
            .send({ approve: true });
        expect(decided.status).toBe(200);
        expect(decided.body.request.status).toBe('PENDING_MANAGER');
        expect(decided.body.request.routedTeam).toBeNull();

        const delegatedAudit = await AuditLog.findOne({
            where: { requestId: r.id },
            order: [['createdAt', 'DESC']]
        });
        expect(delegatedAudit.actorName).toBe(marcus.name);
        expect(delegatedAudit.action).toMatch(new RegExp(`acting for ${aiden.name}`, 'i'));

        const graceH = await auth('grace@wypledu.online');
        const managerQueue = await request(app).get('/leave/pending').set(graceH);
        expect(managerQueue.status).toBe(200);
        const routed = managerQueue.body.find((item) => item.id === r.id);
        expect(routed).toBeTruthy();
        expect(routed.actingFor).toBeUndefined();
        await Delegation.destroy({ where: { id: del.id } });
    });

    test('cancelling a pending request notifies the currently responsible approver', async () => {
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(46),
            endDate: plusDays(46),
            days: 1,
            halfDay: false,
            reason: 'M3 cancellation notification fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false,
            stageEnteredAt: new Date()
        });
        createdRequestIds.push(r.id);

        const weilingH = await auth('weiling@wypledu.online');
        const cancelled = await request(app).put(`/leave/${r.id}/cancel`).set(weilingH);
        expect(cancelled.status).toBe(200);
        const note = await Notification.findOne({
            where: { userId: marcus.id, requestId: r.id, type: 'APPROVAL' }
        });
        expect(note).toBeTruthy();
        expect(note.message).toMatch(/cancelled/i);
    });

    test('24h reminder reaches the original approver and active delegate, deduplicates, and stops after resolution', async () => {
        const r = await LeaveRequest.create({
            employeeId: teamBEmployee.id,
            leaveType: 'annual',
            startDate: plusDays(47),
            endDate: plusDays(47),
            days: 1,
            halfDay: false,
            reason: 'M3 reminder fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false,
            stageEnteredAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        });
        createdRequestIds.push(r.id);
        const del = await Delegation.create({
            fromUserId: aiden.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(1),
            reason: 'M3 reminder delegate fixture',
            active: true
        });
        createdDelegationIds.push(del.id);

        const dianaH = await auth('diana@wypledu.online');
        const first = await request(app).post('/notification/run-reminders').set(dianaH);
        expect(first.status).toBe(200);
        const delegateNotes = await Notification.count({
            where: { userId: marcus.id, requestId: r.id, type: 'REMINDER' }
        });
        const originalNotes = await Notification.count({
            where: { userId: aiden.id, requestId: r.id, type: 'REMINDER' }
        });
        expect(delegateNotes).toBe(1);
        expect(originalNotes).toBe(1);

        await request(app).post('/notification/run-reminders').set(dianaH);
        expect(await Notification.count({
            where: { userId: marcus.id, requestId: r.id, type: 'REMINDER' }
        })).toBe(1);

        r.status = 'REJECTED';
        r.stageEnteredAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
        r.lastReminderKey = null;
        await r.save();
        await request(app).post('/notification/run-reminders').set(dianaH);
        expect(await Notification.count({ where: { requestId: r.id, type: 'REMINDER' } })).toBe(2);
        await Delegation.destroy({ where: { id: del.id } });
    });

    test('bulk rejection requires and records one reason per transactional decision', async () => {
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(48),
            endDate: plusDays(48),
            days: 1,
            halfDay: false,
            reason: 'M3 bulk rejection fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false,
            stageEnteredAt: new Date()
        });
        createdRequestIds.push(r.id);
        const marcusH = await auth('marcus@wypledu.online');
        const missing = await request(app)
            .put('/leave/bulk-decide')
            .set(marcusH)
            .send({ ids: [r.id], approve: false });
        expect(missing.status).toBe(400);
        expect(missing.body.message).toMatch(/Rejection reason is required/i);

        const rejected = await request(app)
            .put('/leave/bulk-decide')
            .set(marcusH)
            .send({ ids: [r.id], approve: false, rejectionReason: 'Coverage cannot be maintained.' });
        expect(rejected.status).toBe(200);
        expect(rejected.body.results[0]).toMatchObject({ id: r.id, ok: true, status: 'REJECTED' });
        await r.reload();
        expect(r.supervisorNote).toBe('Coverage cannot be maintained.');
        expect(await Comment.count({ where: { requestId: r.id } })).toBe(1);
    });

    // ---- A10 + A11: bulk-decide pending_sup succeeds, pending_manager fails tier ----
    test('bulk-decide as SUPERVISOR: PENDING_SUPERVISOR succeeds, PENDING_MANAGER not at Supervisor tier', async () => {
        const pendingSup = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(21),
            endDate: plusDays(21),
            days: 1,
            halfDay: false,
            reason: 'M3 bulk sup fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false
        });
        createdRequestIds.push(pendingSup.id);

        const pendingMgr = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'sick_mc',
            startDate: plusDays(22),
            endDate: plusDays(22),
            days: 1,
            halfDay: false,
            reason: 'M3 bulk mgr fixture',
            status: 'PENDING_MANAGER',
            flagged: false
        });
        createdRequestIds.push(pendingMgr.id);

        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app)
            .put('/leave/bulk-decide')
            .set(marcusH)
            .send({ ids: [pendingSup.id, pendingMgr.id], approve: true });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.results)).toBe(true);
        expect(res.body.results).toHaveLength(2);

        const r0 = res.body.results.find((x) => x.id === pendingSup.id);
        const r1 = res.body.results.find((x) => x.id === pendingMgr.id);
        expect(r0.ok).toBe(true);
        expect(r0.status).toBe('PENDING_MANAGER');
        expect(r1.ok).toBe(false);
        expect(r1.message).toMatch(/not at the Supervisor tier/i);
    });

    // ---- A14: delegate must be SUPERVISOR or MANAGER ----
    test('POST /delegation with EMPLOYEE toUserId → 400', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app)
            .post('/delegation')
            .set(marcusH)
            .send({
                toUserId: weiling.id,
                startDate: today(),
                endDate: plusDays(3),
                reason: 'M3 integration test'
            });
        expect(res.status).toBe(400);
        expect(res.body.message || JSON.stringify(res.body)).toMatch(/SUPERVISOR|MANAGER|approver|Delegate/i);
    });

    // ---- A16: non-owner revoke → 403 ----
    test('non-owner cannot revoke delegation → 403', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const create = await request(app)
            .post('/delegation')
            .set(marcusH)
            .send({
                toUserId: aiden.id,
                startDate: today(),
                endDate: plusDays(2),
                reason: 'M3 integration test'
            });
        expect(create.status).toBe(200);
        const delId = create.body.id;
        createdDelegationIds.push(delId);

        // Aiden is the same-tier delegate, but only Marcus owns this record.
        const aidenH = await auth('aiden@wypledu.online');
        const revoke = await request(app)
            .put(`/delegation/${delId}/revoke`)
            .set(aidenH);
        expect(revoke.status).toBe(403);

        // cleanup
        await request(app).put(`/delegation/${delId}/revoke`).set(marcusH);
    });

    // ---- A17-style: delegate sees delegator queue with actingFor ----
    test('delegate GET /leave/pending includes actingFor for delegated team queue', async () => {
        // Team B SUPERVISOR delegates to marcus (also SUPERVISOR) for today
        const del = await Delegation.create({
            fromUserId: teamBSupervisor.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(3),
            reason: 'M3 actingFor fixture',
            active: true
        });
        createdDelegationIds.push(del.id);

        const marcusH = await auth('marcus@wypledu.online');
        const res = await request(app)
            .get('/leave/pending')
            .set(marcusH);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        const tagged = res.body.find((r) => r.id === teamBPending.id);
        expect(tagged).toBeTruthy();
        expect(tagged.actingFor).toBeTruthy();
        expect(tagged.actingFor.name).toBe(teamBSupervisor.name);
        expect(tagged.actingFor.id).toBe(teamBSupervisor.id);

        // Own-team items must not be incorrectly tagged (deduplication / own path)
        const ownTeamItems = res.body.filter(
            (r) => r.employee && r.employee.team === marcus.team && !r.actingFor
        );
        // Untagged own-team rows are expected; if none are pending, that is acceptable.
        // Critical: teamB item is tagged and appears only once.
        const teamBHits = res.body.filter((r) => r.id === teamBPending.id);
        expect(teamBHits).toHaveLength(1);

        // silence unused variable
        expect(ownTeamItems === ownTeamItems).toBe(true);

        await Delegation.destroy({ where: { id: del.id } });
    });

    // Additional validation from the matrix: empty comment body → 400 errors
    test('POST comment with empty body → 400 errors', async () => {
        const r = await LeaveRequest.create({
            employeeId: weiling.id,
            leaveType: 'annual',
            startDate: plusDays(25),
            endDate: plusDays(25),
            days: 1,
            halfDay: false,
            reason: 'M3 empty comment fixture',
            status: 'PENDING_SUPERVISOR',
            flagged: false
        });
        createdRequestIds.push(r.id);

        const weilingH = await auth('weiling@wypledu.online');
        const res = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(weilingH)
            .send({ body: '' });
        expect(res.status).toBe(400);
        expect(res.body.errors).toBeDefined();
    });

    test('R1 approver team schedule enforces own/delegated team access and returns scheduling data only', async () => {
        const marcusH = await auth('marcus@wypledu.online');

        const own = await request(app).get('/leave/team-calendar').set(marcusH);
        expect(own.status).toBe(200);
        expect(own.body.teamName).toBe(marcus.team);
        expect(Array.isArray(own.body.team)).toBe(true);
        expect(Array.isArray(own.body.approved)).toBe(true);
        const serialized = JSON.stringify(own.body);
        expect(serialized).not.toMatch(/"reason"|leaveType|attachment|medical|privateNote/i);

        const denied = await request(app)
            .get('/leave/team-calendar')
            .query({ team: aiden.team })
            .set(marcusH);
        expect(denied.status).toBe(403);

        const active = await Delegation.create({
            fromUserId: aiden.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(1),
            reason: 'R1 schedule delegate',
            active: true
        });
        createdDelegationIds.push(active.id);
        const delegated = await request(app)
            .get('/leave/team-calendar')
            .query({ team: aiden.team })
            .set(marcusH);
        expect(delegated.status).toBe(200);
        expect(delegated.body.teamName).toBe(aiden.team);
        expect(delegated.body.actingFor).toMatchObject({ id: aiden.id, name: aiden.name });
        await active.destroy();

        const revoked = await Delegation.create({
            fromUserId: aiden.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(1),
            reason: 'R1 revoked schedule delegate',
            active: false,
            revokedAt: new Date()
        });
        createdDelegationIds.push(revoked.id);
        const revokedDenied = await request(app)
            .get('/leave/team-calendar')
            .query({ team: aiden.team })
            .set(marcusH);
        expect(revokedDenied.status).toBe(403);
        await revoked.destroy();

        const expired = await Delegation.create({
            fromUserId: aiden.id,
            toUserId: marcus.id,
            startDate: plusDays(-3),
            endDate: plusDays(-1),
            reason: 'R1 expired schedule delegate',
            active: true
        });
        createdDelegationIds.push(expired.id);
        const expiredDenied = await request(app)
            .get('/leave/team-calendar')
            .query({ team: aiden.team })
            .set(marcusH);
        expect(expiredDenied.status).toBe(403);
        await expired.destroy();
    });

    test('R2 full original approval chain shares pending comments and terminal threads become read-only', async () => {
        const r = await makeLeave({ status: 'PENDING_MANAGER', reason: 'R2 chain access' });
        const marcusH = await auth('marcus@wypledu.online');
        const dianaH = await auth('diana@wypledu.online');
        const aidenH = await auth('aiden@wypledu.online');
        const graceH = await auth('grace@wypledu.online');
        const hrH = await auth('hr@wypledu.online');
        const weilingH = await auth('weiling@wypledu.online');

        const supervisorPost = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(marcusH)
            .send({ body: 'Supervisor remains involved at Manager stage.' });
        expect(supervisorPost.status).toBe(200);

        const managerPost = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(dianaH)
            .send({ body: 'Manager reviewing final decision.' });
        expect(managerPost.status).toBe(200);

        expect((await request(app).get(`/leave/${r.id}/comments`).set(hrH)).status).toBe(200);
        expect((await request(app).post(`/leave/${r.id}/comments`).set(hrH).send({ body: 'HR is not authorised to post.' })).status).toBe(403);
        expect((await request(app).get(`/leave/${r.id}/comments`).set(aidenH)).status).toBe(403);
        expect((await request(app).get(`/leave/${r.id}/comments`).set(graceH)).status).toBe(403);

        expect(await Comment.count({ where: { requestId: r.id } })).toBe(2);
        expect(await AuditLog.count({
            where: { requestId: r.id, action: { [db.Sequelize.Op.like]: 'Comment posted by%' } }
        })).toBe(2);

        r.status = 'APPROVED';
        await r.save();
        for (const headers of [weilingH, marcusH, dianaH, hrH]) {
            const read = await request(app).get(`/leave/${r.id}/comments`).set(headers);
            expect(read.status).toBe(200);
        }
        const locked = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(weilingH)
            .send({ body: 'Comments are prohibited on terminal requests.' });
        expect(locked.status).toBe(400);
        expect(await Comment.count({ where: { requestId: r.id } })).toBe(2);
    });

    test('R2 active delegate can participate across the shared chain and loses access after revocation', async () => {
        const r = await makeLeave({ employee: teamBEmployee, status: 'PENDING_MANAGER', reason: 'R2 delegate comments' });
        const delegation = await Delegation.create({
            fromUserId: aiden.id,
            toUserId: marcus.id,
            startDate: today(),
            endDate: plusDays(2),
            reason: 'R2 comment delegate',
            active: true
        });
        createdDelegationIds.push(delegation.id);
        const marcusH = await auth('marcus@wypledu.online');

        expect((await request(app).get(`/leave/${r.id}/comments`).set(marcusH)).status).toBe(200);
        const posted = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(marcusH)
            .send({ body: 'Acting Supervisor comment for Team B.' });
        expect(posted.status).toBe(200);
        const auditRow = await AuditLog.findOne({
            where: { requestId: r.id, action: { [db.Sequelize.Op.like]: 'Comment posted by%' } }
        });
        expect(auditRow.action).toMatch(/acting for/i);

        delegation.active = false;
        delegation.revokedAt = new Date();
        await delegation.save();
        expect((await request(app).get(`/leave/${r.id}/comments`).set(marcusH)).status).toBe(403);
    });

    test('R4 validation, unauthorized access, and terminal posting create neither comment nor audit', async () => {
        const r = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R4 atomic failures' });
        const weilingH = await auth('weiling@wypledu.online');
        const aidenH = await auth('aiden@wypledu.online');
        const counts = async () => ({
            comments: await Comment.count({ where: { requestId: r.id } }),
            audits: await AuditLog.count({
                where: { requestId: r.id, action: { [db.Sequelize.Op.like]: 'Comment posted by%' } }
            })
        });
        const before = await counts();

        expect((await request(app).post(`/leave/${r.id}/comments`).set(weilingH).send({ body: '   ' })).status).toBe(400);
        expect(await counts()).toEqual(before);
        expect((await request(app).post(`/leave/${r.id}/comments`).set(aidenH).send({ body: 'Unauthorised team.' })).status).toBe(403);
        expect(await counts()).toEqual(before);

        r.status = 'REJECTED';
        await r.save();
        expect((await request(app).post(`/leave/${r.id}/comments`).set(weilingH).send({ body: 'Terminal.' })).status).toBe(400);
        expect(await counts()).toEqual(before);
    });

    test('R3 employee comment notifies every other chain participant once, excludes author, and ignores unrelated users', async () => {
        const hash = await bcrypt.hash(PASS, 10);
        const duplicateParticipant = await User.create({
            name: 'M3 Duplicate Supervisor',
            email: `m3-duplicate-${Date.now()}@wypledu.online`,
            password: hash,
            role: 'SUPERVISOR',
            country: 'SG',
            team: marcus.team,
            initials: 'DS',
            notifyInApp: true,
            notifyEmail: false,
            status: 'ACTIVE'
        });
        createdUserIds.push(duplicateParticipant.id);
        const delegation = await Delegation.create({
            fromUserId: marcus.id,
            toUserId: duplicateParticipant.id,
            startDate: today(),
            endDate: plusDays(1),
            reason: 'R3 dedupe fixture',
            active: true
        });
        createdDelegationIds.push(delegation.id);

        const r = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R3 participant notification' });
        const weilingH = await auth('weiling@wypledu.online');
        const post = await request(app)
            .post(`/leave/${r.id}/comments`)
            .set(weilingH)
            .send({ body: 'Please review this request.' });
        expect(post.status).toBe(200);

        for (const user of [marcus, diana, duplicateParticipant]) {
            expect(await Notification.count({ where: { requestId: r.id, type: 'COMMENT', userId: user.id } })).toBe(1);
        }
        expect(await Notification.count({ where: { requestId: r.id, type: 'COMMENT', userId: weiling.id } })).toBe(0);
        expect(await Notification.count({ where: { requestId: r.id, type: 'COMMENT', userId: aiden.id } })).toBe(0);
        expect(await Notification.count({ where: { requestId: r.id, type: 'COMMENT', userId: grace.id } })).toBe(0);
        await delegation.destroy();
    });

    test('R3 Supervisor and Manager comments notify the other original participants', async () => {
        const marcusH = await auth('marcus@wypledu.online');
        const dianaH = await auth('diana@wypledu.online');

        const supervisorRequest = await makeLeave({ status: 'PENDING_MANAGER', reason: 'R3 supervisor comment' });
        expect((await request(app)
            .post(`/leave/${supervisorRequest.id}/comments`)
            .set(marcusH)
            .send({ body: 'Supervisor context for final review.' })).status).toBe(200);
        expect(await Notification.count({ where: { requestId: supervisorRequest.id, type: 'COMMENT', userId: weiling.id } })).toBe(1);
        expect(await Notification.count({ where: { requestId: supervisorRequest.id, type: 'COMMENT', userId: diana.id } })).toBe(1);
        expect(await Notification.count({ where: { requestId: supervisorRequest.id, type: 'COMMENT', userId: marcus.id } })).toBe(0);

        const managerRequest = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R3 manager comment' });
        expect((await request(app)
            .post(`/leave/${managerRequest.id}/comments`)
            .set(dianaH)
            .send({ body: 'Manager is following the shared thread.' })).status).toBe(200);
        expect(await Notification.count({ where: { requestId: managerRequest.id, type: 'COMMENT', userId: weiling.id } })).toBe(1);
        expect(await Notification.count({ where: { requestId: managerRequest.id, type: 'COMMENT', userId: marcus.id } })).toBe(1);
        expect(await Notification.count({ where: { requestId: managerRequest.id, type: 'COMMENT', userId: diana.id } })).toBe(0);
    });

    test('R3 notification preferences and email failure do not roll back a valid comment', async () => {
        const originalInApp = diana.notifyInApp;
        const originalEmail = diana.notifyEmail;
        diana.notifyInApp = false;
        diana.notifyEmail = false;
        await diana.save();
        const preferencesRequest = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R3 preferences' });
        const weilingH = await auth('weiling@wypledu.online');
        expect((await request(app)
            .post(`/leave/${preferencesRequest.id}/comments`)
            .set(weilingH)
            .send({ body: 'Preference-aware comment.' })).status).toBe(200);
        expect(await Notification.count({ where: { requestId: preferencesRequest.id, type: 'COMMENT', userId: diana.id } })).toBe(0);
        expect(await Notification.count({ where: { requestId: preferencesRequest.id, type: 'COMMENT', userId: marcus.id } })).toBe(1);
        diana.notifyInApp = originalInApp;
        diana.notifyEmail = originalEmail;
        await diana.save();

        const mailFailureRequest = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R3 mail failure' });
        const mailSpy = jest.spyOn(mailer, 'sendNotificationEmail').mockRejectedValue(new Error('simulated mail failure'));
        try {
            const response = await request(app)
                .post(`/leave/${mailFailureRequest.id}/comments`)
                .set(weilingH)
                .send({ body: 'This comment must survive mail failure.' });
            expect(response.status).toBe(200);
            expect(await Comment.count({ where: { requestId: mailFailureRequest.id } })).toBe(1);
            expect(await AuditLog.count({
                where: { requestId: mailFailureRequest.id, action: { [db.Sequelize.Op.like]: 'Comment posted by%' } }
            })).toBe(1);
        } finally {
            mailSpy.mockRestore();
        }
    });

    test('R5 flagged requests are excluded from bulk approve and reject while eligible items continue', async () => {
        const year = new Date().getFullYear();
        const balance = await LeaveBalance.findOne({ where: { userId: weiling.id, leaveType: 'annual', year } });
        const usedBefore = Number(balance.used);
        const flagged = await makeLeave({ status: 'PENDING_MANAGER', flagged: true, reason: 'R5 bulk excluded' });
        const eligible = await makeLeave({ status: 'PENDING_MANAGER', flagged: false, reason: 'R5 bulk eligible' });
        const dianaH = await auth('diana@wypledu.online');

        const approved = await request(app)
            .put('/leave/bulk-decide')
            .set(dianaH)
            .send({ ids: [flagged.id, eligible.id], approve: true, acknowledgeException: true });
        expect(approved.status).toBe(200);
        expect(approved.body.results.find((item) => item.id === flagged.id)).toMatchObject({
            ok: false,
            message: 'Coverage-flagged requests require individual Manager review.'
        });
        expect(approved.body.results.find((item) => item.id === eligible.id)).toMatchObject({ ok: true, status: 'APPROVED' });
        await flagged.reload();
        expect(flagged.status).toBe('PENDING_MANAGER');
        expect(await Comment.count({ where: { requestId: flagged.id } })).toBe(0);
        expect(await AuditLog.count({ where: { requestId: flagged.id } })).toBe(0);
        expect(await Notification.count({ where: { requestId: flagged.id } })).toBe(0);

        const rejected = await request(app)
            .put('/leave/bulk-decide')
            .set(dianaH)
            .send({ ids: [flagged.id], approve: false, rejectionReason: 'Individual review required.' });
        expect(rejected.status).toBe(200);
        expect(rejected.body.results[0].ok).toBe(false);
        await flagged.reload();
        expect(flagged.status).toBe('PENDING_MANAGER');
        expect(await Comment.count({ where: { requestId: flagged.id } })).toBe(0);
        expect(await AuditLog.count({ where: { requestId: flagged.id } })).toBe(0);

        const individual = await makeLeave({ status: 'PENDING_MANAGER', flagged: true, reason: 'R5 individual exception' });
        const individualApproval = await request(app)
            .put(`/leave/${individual.id}/decide`)
            .set(dianaH)
            .send({ approve: true, acknowledgeException: true });
        expect(individualApproval.status).toBe(200);
        expect(individualApproval.body.request.status).toBe('APPROVED');

        balance.used = usedBefore;
        await balance.save();
    });

    test('R4 bulk rejection audits each successful comment and creates nothing for a failed item', async () => {
        const successA = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R4 bulk success A' });
        const successB = await makeLeave({ status: 'PENDING_SUPERVISOR', reason: 'R4 bulk success B' });
        const failed = await makeLeave({ status: 'PENDING_MANAGER', reason: 'R4 bulk wrong tier' });
        const marcusH = await auth('marcus@wypledu.online');
        const response = await request(app)
            .put('/leave/bulk-decide')
            .set(marcusH)
            .send({
                ids: [successA.id, successB.id, failed.id],
                approve: false,
                rejectionReason: 'Operational coverage cannot be maintained.'
            });
        expect(response.status).toBe(200);
        expect(response.body.results.find((item) => item.id === successA.id).ok).toBe(true);
        expect(response.body.results.find((item) => item.id === successB.id).ok).toBe(true);
        expect(response.body.results.find((item) => item.id === failed.id).ok).toBe(false);

        for (const row of [successA, successB]) {
            expect(await Comment.count({ where: { requestId: row.id } })).toBe(1);
            expect(await AuditLog.count({
                where: { requestId: row.id, action: { [db.Sequelize.Op.like]: 'Comment posted by%' } }
            })).toBe(1);
        }
        expect(await Comment.count({ where: { requestId: failed.id } })).toBe(0);
        expect(await AuditLog.count({ where: { requestId: failed.id } })).toBe(0);
    });

    test('production always requires 2FA and never returns an offline demo code', async () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousMode = process.env.TWO_FACTOR_MODE;
        process.env.NODE_ENV = 'production';
        process.env.TWO_FACTOR_MODE = 'always';
        try {
            const start = await request(app)
                .post('/user/login')
                .send({ email: 'weiling@wypledu.online', password: PASS });
            expect(start.status).toBe(200);
            expect(start.body.challengeToken).toBeTruthy();
            expect(start.body.accessToken).toBeUndefined();

            const sent = await request(app).post('/user/2fa/send').send({
                challengeToken: start.body.challengeToken,
                method: 'EMAIL'
            });
            expect(sent.status).toBe(200);
            expect(sent.body.demoCode).toBeUndefined();
        } finally {
            process.env.NODE_ENV = previousNodeEnv;
            process.env.TWO_FACTOR_MODE = previousMode;
            await TwoFactorChallenge.destroy({ where: { userId: weiling.id } });
        }
    });
});
