const {
    matchesTier,
    isDelegationActive,
    canActOn,
    canReadCommentThread,
    canPostComment,
    authorizedTeamContexts
} = require('../services/delegationService');

describe('matchesTier', () => {
    test('SUPERVISOR matches PENDING_SUPERVISOR', () => {
        expect(matchesTier("SUPERVISOR", "PENDING_SUPERVISOR")).toBe(true);
    });

    test('SUPERVISOR does not match PENDING_MANAGER', () => {
        expect(matchesTier("SUPERVISOR", "PENDING_MANAGER")).toBe(false);
    });

    test('MANAGER matches PENDING_MANAGER', () => {
        expect(matchesTier("MANAGER", "PENDING_MANAGER")).toBe(true);
    });
});

describe('isDelegationActive', () => {
    test('active row, today inside window → true', () => {
        const d = { active: true, startDate: "2026-07-10", endDate: "2026-07-20" };
        expect(isDelegationActive(d, "2026-07-14")).toBe(true);
    });

    test('active row, today after endDate → false (auto-expiry)', () => {
        const d = { active: true, startDate: "2026-07-10", endDate: "2026-07-12" };
        expect(isDelegationActive(d, "2026-07-14")).toBe(false);
    });

    test('active:false, today inside window → false (revoked)', () => {
        const d = { active: false, startDate: "2026-07-10", endDate: "2026-07-20" };
        expect(isDelegationActive(d, "2026-07-14")).toBe(false);
    });
});

describe('canActOn', () => {
    const supervisor = { id: 2, role: "SUPERVISOR", team: "Compliance Team A" };
    const requestPendingSup = {
        status: "PENDING_SUPERVISOR",
        employee: { team: "Compliance Team A" }
    };

    test('same team, matching tier, no delegations → true', () => {
        expect(canActOn(supervisor, requestPendingSup, [])).toBe(true);
    });

    test('approver cannot act on their own leave request', () => {
        const ownRequest = {
            employeeId: supervisor.id,
            status: "PENDING_SUPERVISOR",
            employee: { team: supervisor.team }
        };
        expect(canActOn(supervisor, ownRequest, [])).toBe(false);
    });

    test('different team, no delegations → false', () => {
        const otherTeamReq = {
            status: "PENDING_SUPERVISOR",
            employee: { team: "Other Team" }
        };
        expect(canActOn(supervisor, otherTeamReq, [])).toBe(false);
    });

    test('explicit reporting line denies an unrelated same-team Supervisor', () => {
        const request = {
            employeeId: 99,
            supervisorId: 777,
            status: "PENDING_SUPERVISOR",
            employee: { team: supervisor.team }
        };
        expect(canActOn(supervisor, request, [])).toBe(false);
    });

    test('explicit reporting line allows only the assigned Supervisor or that Supervisor delegate', () => {
        const request = {
            employeeId: 99,
            supervisorId: 777,
            status: "PENDING_SUPERVISOR",
            employee: { team: "Other Team" }
        };
        const assigned = { id: 777, role: "SUPERVISOR", team: "Other Team" };
        const deputy = { id: 888, role: "SUPERVISOR", team: "Deputy Team" };
        expect(canActOn(assigned, request, [])).toBe(true);
        expect(canActOn(deputy, request, [{ fromUser: assigned }])).toBe(true);
    });

    test('different team but effective delegation from matching-team+tier approver → true', () => {
        const otherTeamReq = {
            status: "PENDING_SUPERVISOR",
            employee: { team: "Other Team" }
        };
        const delegations = [{
            fromUser: { team: "Other Team", role: "SUPERVISOR" }
        }];
        expect(canActOn(supervisor, otherTeamReq, delegations)).toBe(true);
    });
});

describe('UC-28 comment authorization', () => {
    const request = {
        employeeId: 1,
        status: 'PENDING_MANAGER',
        employee: { team: 'Compliance Team A' }
    };

    test('request owner can read and post while pending', () => {
        const employee = { id: 1, role: 'EMPLOYEE', team: 'Compliance Team A' };
        expect(canReadCommentThread(employee, request, [])).toBe(true);
        expect(canPostComment(employee, request, [])).toBe(true);
    });

    test('original Supervisor retains read/write access at Manager stage', () => {
        const supervisor = { id: 2, role: 'SUPERVISOR', team: 'Compliance Team A' };
        expect(canReadCommentThread(supervisor, request, [])).toBe(true);
        expect(canPostComment(supervisor, request, [])).toBe(true);
    });

    test('original Manager can participate before the request reaches Manager tier', () => {
        const manager = { id: 3, role: 'MANAGER', team: 'Compliance Team A' };
        const supervisorStage = { ...request, status: 'PENDING_SUPERVISOR' };
        expect(canReadCommentThread(manager, supervisorStage, [])).toBe(true);
        expect(canPostComment(manager, supervisorStage, [])).toBe(true);
    });

    test('active same-tier delegate can participate for covered original team', () => {
        const delegate = { id: 4, role: 'SUPERVISOR', team: 'Compliance Team B' };
        const delegations = [{ fromUser: { id: 2, name: 'Original Sup', role: 'SUPERVISOR', team: 'Compliance Team A' } }];
        expect(canReadCommentThread(delegate, request, delegations)).toBe(true);
        expect(canPostComment(delegate, request, delegations)).toBe(true);
    });

    test('wrong-team approver is denied and HR is read-only', () => {
        const wrongTeam = { id: 5, role: 'MANAGER', team: 'Compliance Team C' };
        const hr = { id: 6, role: 'HR_ADMIN', team: 'HR' };
        expect(canReadCommentThread(wrongTeam, request, [])).toBe(false);
        expect(canPostComment(wrongTeam, request, [])).toBe(false);
        expect(canReadCommentThread(hr, request, [])).toBe(true);
        expect(canPostComment(hr, request, [])).toBe(false);
    });

    test('terminal thread remains readable but cannot be posted to', () => {
        const manager = { id: 3, role: 'MANAGER', team: 'Compliance Team A' };
        const terminal = { ...request, status: 'APPROVED' };
        expect(canReadCommentThread(manager, terminal, [])).toBe(true);
        expect(canPostComment(manager, terminal, [])).toBe(false);
    });
});

describe('UC-08 authorized team contexts', () => {
    test('returns own team plus deduplicated active delegated teams with acting-for context', () => {
        const user = { id: 10, role: 'SUPERVISOR', team: 'Team A' };
        const delegations = [
            { fromUser: { id: 11, name: 'Sup B', role: 'SUPERVISOR', team: 'Team B' } },
            { fromUser: { id: 12, name: 'Sup B2', role: 'SUPERVISOR', team: 'Team B' } },
            { fromUser: { id: 13, name: 'Manager C', role: 'MANAGER', team: 'Team C' } }
        ];
        expect(authorizedTeamContexts(user, delegations)).toEqual([
            { team: 'Team A', actingFor: null },
            { team: 'Team B', actingFor: { id: 11, name: 'Sup B' } }
        ]);
    });
});
