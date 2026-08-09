/**
 * Member 3 focused unit tests.
 * Author: Wai Yan Hpone Lat
 *
 * These tests exercise behavior through the public pure helpers. They do not
 * require MySQL and deliberately assert authorization/state outcomes rather
 * than private implementation details.
 */

const chain = require('../../server/services/approvalChain');
const {
    matchesTier,
    isDelegationActive,
    canActOn,
    canReadCommentThread,
    canPostComment,
    authorizedTeamContexts
} = require('../../server/services/delegationService');
const {
    buildReminderKey,
    parseReminderKey,
    isReminderDue
} = require('../../server/services/notificationService');
const { todayISO } = require('../../server/services/businessTime');

describe('M3 approval-chain routing', () => {
    test.each([
        ['EMPLOYEE', 'PENDING_SUPERVISOR'],
        ['HR_ADMIN', 'PENDING_SUPERVISOR'],
        ['SUPERVISOR', 'PENDING_MANAGER'],
        ['MANAGER', 'PENDING_BOSS'],
        ['BOSS', 'PENDING_MANAGER']
    ])('%s request starts at %s', (role, expected) => {
        expect(chain.initialStatusFor(role)).toBe(expected);
    });

    test('Supervisor approval advances but is never final', () => {
        expect(chain.nextStatusAfterApproval('PENDING_SUPERVISOR')).toBe('PENDING_MANAGER');
        expect(chain.isFinalStage('PENDING_SUPERVISOR')).toBe(false);
    });

    test.each([
        ['PENDING_MANAGER', 'MANAGER'],
        ['PENDING_BOSS', 'BOSS']
    ])('%s is a final stage owned by %s', (status, role) => {
        expect(chain.isFinalStage(status)).toBe(true);
        expect(chain.approverRoleFor(status)).toBe(role);
    });

    test('terminal status has no approver role', () => {
        expect(chain.approverRoleFor('APPROVED')).toBeNull();
    });
});

describe('M3 decision authorization', () => {
    const teamRequest = {
        employeeId: 9,
        status: 'PENDING_SUPERVISOR',
        employee: { role: 'EMPLOYEE', team: 'Team A' }
    };

    test('matching tier and original team can act', () => {
        expect(canActOn(
            { id: 2, role: 'SUPERVISOR', team: 'Team A' },
            teamRequest,
            []
        )).toBe(true);
    });

    test('wrong tier cannot act even on the same team', () => {
        expect(matchesTier('MANAGER', teamRequest.status)).toBe(false);
        expect(canActOn(
            { id: 3, role: 'MANAGER', team: 'Team A' },
            teamRequest,
            []
        )).toBe(false);
    });

    test('an approver cannot decide their own request', () => {
        expect(canActOn(
            { id: 9, role: 'SUPERVISOR', team: 'Team A' },
            teamRequest,
            []
        )).toBe(false);
    });

    test('an active same-tier delegation grants covered-team authority', () => {
        const delegate = { id: 6, role: 'SUPERVISOR', team: 'Team B' };
        const delegations = [{
            fromUser: { id: 2, name: 'Original Supervisor', role: 'SUPERVISOR', team: 'Team A' }
        }];
        expect(canActOn(delegate, teamRequest, delegations)).toBe(true);
    });

    test('a cross-tier delegation never grants decision authority', () => {
        const delegate = { id: 6, role: 'SUPERVISOR', team: 'Team B' };
        const delegations = [{
            fromUser: { id: 3, name: 'Original Manager', role: 'MANAGER', team: 'Team A' }
        }];
        expect(canActOn(delegate, teamRequest, delegations)).toBe(false);
    });

    test('an explicit reporting line overrides the broad team fallback', () => {
        const assignedRequest = { ...teamRequest, supervisorId: 77 };
        const peer = { id: 2, role: 'SUPERVISOR', team: 'Team A' };
        const assigned = { id: 77, role: 'SUPERVISOR', team: 'Team A' };
        expect(canActOn(peer, assignedRequest, [])).toBe(false);
        expect(canActOn(assigned, assignedRequest, [])).toBe(true);
    });

    test('Manager leave is company-wide Boss authority', () => {
        const request = {
            employeeId: 30,
            status: 'PENDING_BOSS',
            employee: { role: 'MANAGER', team: 'Team C' }
        };
        expect(canActOn({ id: 40, role: 'BOSS', team: 'Executive' }, request, [])).toBe(true);
        expect(canActOn({ id: 41, role: 'MANAGER', team: 'Team C' }, request, [])).toBe(false);
    });

    test('Boss leave is company-wide Manager authority', () => {
        const request = {
            employeeId: 40,
            status: 'PENDING_MANAGER',
            employee: { role: 'BOSS', team: 'Executive' }
        };
        expect(canActOn({ id: 41, role: 'MANAGER', team: 'Any Team' }, request, [])).toBe(true);
        expect(canActOn({ id: 42, role: 'SUPERVISOR', team: 'Executive' }, request, [])).toBe(false);
    });
});

describe('M3 delegation windows and schedule contexts', () => {
    const delegation = {
        active: true,
        startDate: '2026-08-09',
        endDate: '2026-08-12'
    };

    test.each(['2026-08-09', '2026-08-10', '2026-08-12'])(
        'delegation is effective on inclusive date %s',
        (date) => expect(isDelegationActive(delegation, date)).toBe(true)
    );

    test('revocation and expiry both remove authority', () => {
        expect(isDelegationActive({ ...delegation, active: false }, '2026-08-10')).toBe(false);
        expect(isDelegationActive(delegation, '2026-08-13')).toBe(false);
    });

    test('team contexts contain own team and deduplicated same-tier delegated teams', () => {
        const contexts = authorizedTeamContexts(
            { id: 6, role: 'SUPERVISOR', team: 'Team B' },
            [
                { fromUser: { id: 2, name: 'Sup A', role: 'SUPERVISOR', team: 'Team A' } },
                { fromUser: { id: 8, name: 'Sup A2', role: 'SUPERVISOR', team: 'Team A' } },
                { fromUser: { id: 3, name: 'Manager C', role: 'MANAGER', team: 'Team C' } }
            ]
        );
        expect(contexts).toEqual([
            { team: 'Team B', actingFor: null },
            { team: 'Team A', actingFor: { id: 2, name: 'Sup A' } }
        ]);
    });
});

describe('M3 comment-thread authorization', () => {
    const pending = {
        employeeId: 9,
        status: 'PENDING_MANAGER',
        employee: { role: 'EMPLOYEE', team: 'Team A' }
    };

    test('owner and original tiers can participate while pending', () => {
        const employee = { id: 9, role: 'EMPLOYEE', team: 'Team A' };
        const supervisor = { id: 2, role: 'SUPERVISOR', team: 'Team A' };
        const manager = { id: 3, role: 'MANAGER', team: 'Team A' };
        for (const user of [employee, supervisor, manager]) {
            expect(canReadCommentThread(user, pending, [])).toBe(true);
            expect(canPostComment(user, pending, [])).toBe(true);
        }
    });

    test('HR is audit-read-only and a wrong team sees nothing', () => {
        const hr = { id: 20, role: 'HR_ADMIN', team: 'HR' };
        const outsider = { id: 21, role: 'MANAGER', team: 'Team Z' };
        expect(canReadCommentThread(hr, pending, [])).toBe(true);
        expect(canPostComment(hr, pending, [])).toBe(false);
        expect(canReadCommentThread(outsider, pending, [])).toBe(false);
        expect(canPostComment(outsider, pending, [])).toBe(false);
    });

    test('terminal threads remain readable and reject new posts', () => {
        const manager = { id: 3, role: 'MANAGER', team: 'Team A' };
        const approved = { ...pending, status: 'APPROVED' };
        expect(canReadCommentThread(manager, approved, [])).toBe(true);
        expect(canPostComment(manager, approved, [])).toBe(false);
    });
});

describe('M3 stage-relative reminder idempotency', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const pending = {
        status: 'PENDING_MANAGER',
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
        stageEnteredAt: new Date('2026-08-09T12:00:00.000Z'),
        lastReminderKey: null
    };

    test('recipient IDs are normalized, deduplicated, and sorted in a stable key', () => {
        const key = buildReminderKey(pending, [10, 3, 10, '7', 0, 'bad']);
        expect(key).toBe('PENDING_MANAGER|2026-08-09T12:00:00.000Z|3,7,10|24h');
        expect(parseReminderKey(key)).toEqual({
            status: 'PENDING_MANAGER',
            stageStart: '2026-08-09T12:00:00.000Z',
            recipientIds: [3, 7, 10]
        });
    });

    test('exactly 24 hours is due but one millisecond early is not', () => {
        expect(isReminderDue(pending, now)).toBe(true);
        const notYet = {
            ...pending,
            stageEnteredAt: new Date(now.getTime() - (24 * 60 * 60 * 1000) + 1)
        };
        expect(isReminderDue(notYet, now)).toBe(false);
    });

    test('the same stage and recipients are idempotent', () => {
        const key = buildReminderKey(pending, [3]);
        const alreadyClaimed = { ...pending, lastReminderKey: key };
        expect(isReminderDue(alreadyClaimed, now, key)).toBe(false);
    });

    test('a newly responsible recipient produces a new reminder claim', () => {
        const oldKey = buildReminderKey(pending, [3]);
        const newKey = buildReminderKey(pending, [3, 7]);
        expect(isReminderDue({ ...pending, lastReminderKey: oldKey }, now, newKey)).toBe(true);
    });

    test('Boss-stage reminders use the same parseable key format', () => {
        const bossRequest = { ...pending, status: 'PENDING_BOSS' };
        const key = buildReminderKey(bossRequest, [1]);
        expect(parseReminderKey(key)).toMatchObject({
            status: 'PENDING_BOSS',
            recipientIds: [1]
        });
        expect(isReminderDue(bossRequest, now, key)).toBe(true);
    });

    test('terminal requests are never reminded', () => {
        expect(isReminderDue({ ...pending, status: 'APPROVED' }, now)).toBe(false);
    });
});

describe('M3 Singapore business date', () => {
    test('00:30 SGT uses the new local calendar day while UTC is still yesterday', () => {
        expect(todayISO(new Date('2026-08-09T16:30:00.000Z'))).toBe('2026-08-10');
    });
});
