const order = [];

jest.mock('../models', () => {
    const transaction = jest.fn(async (callback) => {
        const result = await callback({ LOCK: { UPDATE: 'UPDATE' } });
        order.push('commit');
        return result;
    });
    return {
        sequelize: { transaction },
        User: { findByPk: jest.fn(), findAll: jest.fn() },
        Delegation: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() },
        AuditLog: { create: jest.fn() }
    };
});

jest.mock('../middlewares/auth', () => ({
    validateToken: (req, _res, next) => {
        req.user = { id: 1, name: 'Supervisor One', role: 'SUPERVISOR', team: 'Team A' };
        next();
    },
    requireRole: () => (_req, _res, next) => next()
}));

jest.mock('../services/notificationService', () => ({
    notifyMany: jest.fn(async () => { order.push('notify'); return []; })
}));

const express = require('express');
const request = require('supertest');
const models = require('../models');
const notificationService = require('../services/notificationService');
const delegationRouter = require('../routes/delegation');

const app = express();
app.use(express.json());
app.use('/delegation', delegationRouter);

const fromUser = {
    id: 1, name: 'Supervisor One', role: 'SUPERVISOR', team: 'Team A', status: 'ACTIVE'
};
const toUser = {
    id: 2, name: 'Supervisor Two', role: 'SUPERVISOR', team: 'Team B', status: 'ACTIVE'
};

describe('email transaction boundary', () => {
    beforeEach(() => {
        order.length = 0;
        jest.clearAllMocks();
        models.User.findByPk.mockImplementation(async (id) => id === 1 ? fromUser : toUser);
        models.Delegation.findOne.mockResolvedValue(null);
        models.Delegation.create.mockResolvedValue({
            id: 55,
            fromUserId: 1,
            toUserId: 2,
            startDate: '2099-01-01',
            endDate: '2099-01-02',
            active: true
        });
        models.AuditLog.create.mockResolvedValue({ id: 90 });
        notificationService.notifyMany.mockImplementation(async () => {
            order.push('notify');
            return [];
        });
    });

    test('delegation notification is attempted only after the database transaction commits', async () => {
        const response = await request(app).post('/delegation').send({
            toUserId: 2,
            startDate: '2099-01-01',
            endDate: '2099-01-02',
            reason: 'Planned absence'
        });
        expect(response.status).toBe(200);
        expect(order).toEqual(['commit', 'notify']);
        expect(notificationService.notifyMany).toHaveBeenCalledTimes(1);
    });

    test('email orchestration failure cannot undo a committed delegation', async () => {
        notificationService.notifyMany.mockImplementation(async () => {
            order.push('notify');
            throw new Error('simulated provider failure');
        });
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const response = await request(app).post('/delegation').send({
            toUserId: 2,
            startDate: '2099-01-01',
            endDate: '2099-01-02',
            reason: 'Planned absence'
        });
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(55);
        expect(order).toEqual(['commit', 'notify']);
        log.mockRestore();
    });
});
