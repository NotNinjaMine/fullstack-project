const request = require('supertest');
const app = require('../index');

describe('API landing routes', () => {
    test('GET / returns only the plain-text API welcome message', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^text\/plain/);
        expect(response.text).toBe('Welcome to the Innovare Leave Management System API.');
        expect(response.text).not.toMatch(/<!doctype html>|<html|<script/i);
    });

    test('GET /health returns API status JSON', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: 'ok',
            service: 'Innovare Leave Management System API'
        });
    });
});
