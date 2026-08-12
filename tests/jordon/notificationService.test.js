'use strict';

jest.mock('../../server/models', () => ({
  Notification: { create: jest.fn(async () => ({ id: 1 })) },
  User: { findByPk: jest.fn(async () => ({ email: 'person@example.com' })), findAll: jest.fn(async () => []) },
  LeaveRequest: { findAll: jest.fn(async () => []) },
  AuditLog: { create: jest.fn(async () => ({ id: 1 })) }
}));

jest.mock('../../server/services/mailer', () => ({
  sendNotificationEmail: jest.fn(async () => ({ sent: true }))
}));

const { isReminderDue } = require('../../server/services/notificationService');

describe('notificationService helpers', () => {
  test('isReminderDue returns true for pending requests older than 24 hours', () => {
    const now = new Date('2026-01-02T00:00:00Z').getTime();
    const request = {
      status: 'PENDING_SUPERVISOR',
      createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      reminderSentAt: null
    };

    expect(isReminderDue(request, now)).toBe(true);
  });

  test('isReminderDue returns false for recent or non-pending requests', () => {
    const now = new Date('2026-01-02T00:00:00Z').getTime();
    const recent = {
      status: 'PENDING_SUPERVISOR',
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      reminderSentAt: null
    };
    const resolved = {
      status: 'APPROVED',
      createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      reminderSentAt: null
    };

    expect(isReminderDue(recent, now)).toBe(false);
    expect(isReminderDue(resolved, now)).toBe(false);
  });
});
