jest.mock('../models', () => ({
    Notification: { create: jest.fn() },
    User: { findByPk: jest.fn(), findAll: jest.fn() },
    LeaveRequest: { findAll: jest.fn() },
    AuditLog: { create: jest.fn() },
    Delegation: { findAll: jest.fn() }
}));

jest.mock('../services/mailer', () => ({
    sendNotificationEmail: jest.fn(),
    validEmail: jest.fn(() => true),
    normalizedEmail: jest.fn((value) => String(value).toLowerCase())
}));

const models = require('../models');
const { getResponsibleApprovers, getCommentParticipants } = require('../services/notificationService');

const user = (id, role, team, overrides = {}) => ({
    id,
    name: `${role} ${id}`,
    role,
    team,
    email: `user${id}@example.test`,
    notifyInApp: true,
    notifyEmail: true,
    status: 'ACTIVE',
    ...overrides
});

describe('M3 server-side recipient resolution', () => {
    beforeEach(() => jest.clearAllMocks());

    test('new request resolves original Supervisor and active same-tier delegate once each', async () => {
        const employee = user(1, 'EMPLOYEE', 'Team A');
        const original = user(2, 'SUPERVISOR', 'Team A');
        const delegate = user(3, 'SUPERVISOR', 'Team B');
        models.User.findAll.mockResolvedValue([original]);
        models.Delegation.findAll.mockResolvedValue([{
            fromUserId: 2,
            toUser: delegate,
            active: true,
            startDate: '2000-01-01',
            endDate: '2999-12-31'
        }]);

        const recipients = await getResponsibleApprovers({
            id: 10, status: 'PENDING_SUPERVISOR', employeeId: 1, employee
        });
        expect(recipients.map((recipient) => recipient.id)).toEqual([2, 3]);
    });

    test('wrong-tier, inactive and expired delegates are excluded', async () => {
        const employee = user(1, 'EMPLOYEE', 'Team A');
        const original = user(4, 'MANAGER', 'Team A');
        models.User.findAll.mockResolvedValue([original]);
        models.Delegation.findAll.mockResolvedValue([
            { fromUserId: 4, toUser: user(5, 'SUPERVISOR', 'Team B'), active: true, startDate: '2000-01-01', endDate: '2999-12-31' },
            { fromUserId: 4, toUser: user(6, 'MANAGER', 'Team B', { status: 'DEACTIVATED' }), active: true, startDate: '2000-01-01', endDate: '2999-12-31' },
            { fromUserId: 4, toUser: user(7, 'MANAGER', 'Team B'), active: true, startDate: '2025-01-01', endDate: '2025-12-31' }
        ]);

        const recipients = await getResponsibleApprovers({
            id: 11, status: 'PENDING_MANAGER', employeeId: 1, employee
        });
        expect(recipients.map((recipient) => recipient.id)).toEqual([4]);
    });

    test('comment participants contain only owner, original chain and active same-tier delegates', async () => {
        const employee = user(1, 'EMPLOYEE', 'Team A');
        const supervisor = user(2, 'SUPERVISOR', 'Team A');
        const manager = user(4, 'MANAGER', 'Team A');
        const supervisorDelegate = user(3, 'SUPERVISOR', 'Team B');
        models.User.findByPk.mockResolvedValue(employee);
        models.User.findAll.mockResolvedValue([supervisor, manager]);
        models.Delegation.findAll.mockResolvedValue([{
            fromUserId: 2,
            toUser: supervisorDelegate,
            active: true,
            startDate: '2000-01-01',
            endDate: '2999-12-31'
        }]);

        const recipients = await getCommentParticipants({ id: 12, employeeId: 1 });
        expect(recipients.map((recipient) => recipient.id)).toEqual([1, 2, 4, 3]);
        expect(recipients.map((recipient) => recipient.id)).not.toContain(99);
    });
});
