jest.mock('../models', () => ({
    Notification: { create: jest.fn() },
    User: { findByPk: jest.fn(), findAll: jest.fn() },
    LeaveRequest: { findAll: jest.fn() },
    AuditLog: { create: jest.fn() },
    Delegation: { findAll: jest.fn() }
}));

jest.mock('../services/mailer', () => ({
    sendNotificationEmail: jest.fn(),
    validEmail: jest.fn((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''))),
    normalizedEmail: jest.fn((value) => String(value || '').trim().toLowerCase())
}));

const models = require('../models');
const mailer = require('../services/mailer');
const { notify, notifyMany } = require('../services/notificationService');

const activeUser = (overrides = {}) => ({
    id: 7,
    email: 'user@example.test',
    notifyInApp: true,
    notifyEmail: true,
    status: 'ACTIVE',
    ...overrides
});

describe('notification channel preferences', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Notification.create.mockResolvedValue({ id: 1 });
        mailer.sendNotificationEmail.mockResolvedValue({ sent: true, skipped: false });
    });

    test('in-app true and email true performs both channels', async () => {
        models.User.findByPk.mockResolvedValue(activeUser());
        const result = await notify(7, 'message', { type: 'APPROVAL', requestId: 2 });
        expect(models.Notification.create).toHaveBeenCalledTimes(1);
        expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1);
        expect(result.inApp.created).toBe(true);
        expect(result.email.sent).toBe(true);
    });

    test('in-app true and email false creates only the persisted row', async () => {
        models.User.findByPk.mockResolvedValue(activeUser({ notifyEmail: false }));
        const result = await notify(7, 'message', { type: 'APPROVAL', requestId: 2 });
        expect(models.Notification.create).toHaveBeenCalledTimes(1);
        expect(mailer.sendNotificationEmail).not.toHaveBeenCalled();
        expect(result.email.reason).toBe('PREFERENCE_DISABLED');
    });

    test('in-app false and email true sends only email', async () => {
        models.User.findByPk.mockResolvedValue(activeUser({ notifyInApp: false }));
        const result = await notify(7, 'message', { type: 'APPROVAL', requestId: 2 });
        expect(models.Notification.create).not.toHaveBeenCalled();
        expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1);
        expect(result.inApp.reason).toBe('PREFERENCE_DISABLED');
        expect(result.email.sent).toBe(true);
    });

    test('both channels false performs neither', async () => {
        models.User.findByPk.mockResolvedValue(activeUser({ notifyInApp: false, notifyEmail: false }));
        const result = await notify(7, 'message');
        expect(models.Notification.create).not.toHaveBeenCalled();
        expect(mailer.sendNotificationEmail).not.toHaveBeenCalled();
        expect(result.inApp.reason).toBe('PREFERENCE_DISABLED');
        expect(result.email.reason).toBe('PREFERENCE_DISABLED');
    });

    test('email failure is sanitized and does not remove the in-app row', async () => {
        models.User.findByPk.mockResolvedValue(activeUser());
        mailer.sendNotificationEmail.mockRejectedValue(new Error('provider password and payload'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await notify(7, 'message', { type: 'COMMENT', requestId: 4 });
        expect(result.inApp.created).toBe(true);
        expect(result.email.reason).toBe('DELIVERY_THREW');
        expect(log).toHaveBeenCalledWith('[notification-email] delivery threw user=7 type=COMMENT request=4.');
        expect(JSON.stringify(result)).not.toContain('provider password');
        log.mockRestore();
    });

    test('in-app persistence failure still attempts email exactly once', async () => {
        models.User.findByPk.mockResolvedValue(activeUser());
        models.Notification.create.mockRejectedValue(new Error('database details'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await notify(7, 'message', { type: 'APPROVAL', requestId: 8 });
        expect(result.inApp.reason).toBe('IN_APP_PERSIST_FAILED');
        expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1);
        expect(result.email.sent).toBe(true);
        log.mockRestore();
    });

    test('missing recipient email skips email without affecting in-app delivery', async () => {
        models.User.findByPk.mockResolvedValue(activeUser({ email: null }));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await notify(7, 'message', { type: 'REMINDER', requestId: 9 });
        expect(result.inApp.created).toBe(true);
        expect(result.email.reason).toBe('MISSING_RECIPIENT_EMAIL');
        expect(mailer.sendNotificationEmail).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test('batch delivery deduplicates user ids and normalized email addresses', async () => {
        models.User.findAll.mockResolvedValue([
            activeUser({ id: 7, email: 'shared@example.test' }),
            activeUser({ id: 8, email: 'SHARED@example.test' })
        ]);
        const results = await notifyMany([7, 7, 8], 'message', { type: 'COMMENT', requestId: 10 });
        expect(models.Notification.create).toHaveBeenCalledTimes(2);
        expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(2);
        expect(results[1].email.reason).toBe('DUPLICATE_RECIPIENT_EMAIL');
    });
});
