const { isReminderDue, buildReminderKey } = require('../services/notificationService');

describe('isReminderDue', () => {
    const now = new Date("2026-07-14T12:00:00.000Z");

    // T10
    test('pending at its current stage for exactly 24h → true', () => {
        const request = {
            status: "PENDING_SUPERVISOR",
            createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            stageEnteredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            lastReminderKey: null
        };
        expect(isReminderDue(request, now)).toBe(true);
    });

    // T11
    test('old request that entered the current stage 2h ago → false', () => {
        const request = {
            status: "PENDING_SUPERVISOR",
            createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            stageEnteredAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
            lastReminderKey: null
        };
        expect(isReminderDue(request, now)).toBe(false);
    });

    // T12
    test('status APPROVED, createdAt 30h ago → false (not pending)', () => {
        const request = {
            status: "APPROVED",
            createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            stageEnteredAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            lastReminderKey: null
        };
        expect(isReminderDue(request, now)).toBe(false);
    });

    // T13
    test('same stage and recipient key is idempotent', () => {
        const request = {
            status: "PENDING_MANAGER",
            createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            stageEnteredAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            lastReminderKey: null
        };
        const key = buildReminderKey(request, [9]);
        request.lastReminderKey = key;
        expect(isReminderDue(request, now, key)).toBe(false);
    });

    test('same stage sends only when a newly responsible recipient appears', () => {
        const request = {
            status: "PENDING_MANAGER",
            createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            stageEnteredAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
            lastReminderKey: null
        };
        request.lastReminderKey = buildReminderKey(request, [9]);
        expect(isReminderDue(request, now, buildReminderKey(request, [9, 10]))).toBe(true);
        expect(isReminderDue(request, now, buildReminderKey(request, [9]))).toBe(false);
    });

    test('one millisecond before the 24h boundary is not due', () => {
        const request = {
            status: "PENDING_MANAGER",
            stageEnteredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 1),
            createdAt: new Date(now.getTime() - 40 * 60 * 60 * 1000)
        };
        expect(isReminderDue(request, now)).toBe(false);
    });
});
