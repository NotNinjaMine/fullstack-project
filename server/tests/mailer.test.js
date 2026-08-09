jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const nodemailer = require('nodemailer');
const mailer = require('../services/mailer');
const { buildNotificationEmail } = require('../services/emailTemplates');

const KEYS = [
    'NODE_ENV', 'SMTP_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE',
    'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_FROM_NAME', 'SMTP_FROM_EMAIL',
    'SMTP_CONNECTION_TIMEOUT_MS', 'SMTP_GREETING_TIMEOUT_MS', 'SMTP_SOCKET_TIMEOUT_MS',
    'CLIENT_URL', 'EMAIL_TEST_MODE', 'EMAIL_TEST_REDIRECT_TO'
];
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

const restoreEnvironment = () => {
    for (const key of KEYS) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
    }
};

const configureValidSmtp = () => {
    process.env.NODE_ENV = 'development';
    process.env.SMTP_ENABLED = 'true';
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_USER = 'sender@example.test';
    process.env.SMTP_PASS = 'unit-test-secret';
    process.env.SMTP_FROM_NAME = 'Annual Leave Management System';
    process.env.SMTP_FROM_EMAIL = 'sender@example.test';
    process.env.SMTP_CONNECTION_TIMEOUT_MS = '7000';
    process.env.SMTP_GREETING_TIMEOUT_MS = '8000';
    process.env.SMTP_SOCKET_TIMEOUT_MS = '9000';
    process.env.CLIENT_URL = 'http://localhost:5173';
};

describe('shared mailer configuration and delivery safety', () => {
    beforeEach(() => {
        restoreEnvironment();
        jest.clearAllMocks();
        mailer.resetForTests();
    });

    afterAll(() => {
        restoreEnvironment();
        mailer.resetForTests();
    });

    test('email-disabled mode starts and skips without SMTP credentials', async () => {
        process.env.NODE_ENV = 'development';
        process.env.SMTP_ENABLED = 'false';
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        expect(mailer.smtpConfigured()).toBe(false);
        await expect(mailer.sendMail({
            to: 'employee@example.test', subject: 'Safe subject', text: 'Safe body'
        })).resolves.toEqual({ sent: false, skipped: true, reason: 'EMAIL_DISABLED' });
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('email-enabled mode reports incomplete configuration without a password value', async () => {
        process.env.NODE_ENV = 'development';
        process.env.SMTP_ENABLED = 'true';
        process.env.SMTP_HOST = 'smtp.example.test';
        process.env.SMTP_USER = 'sender@example.test';
        process.env.SMTP_PASS = 'never-print-this-password';
        delete process.env.SMTP_FROM_EMAIL;
        process.env.SMTP_FROM_EMAIL = 'not-an-email';
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(mailer.smtpConfigured()).toBe(false);
        const result = await mailer.verifyTransport();
        expect(result.reason).toBe('EMAIL_CONFIG_INVALID');
        const output = JSON.stringify([result, log.mock.calls]);
        expect(output).not.toContain('never-print-this-password');
        expect(output).not.toContain('sender@example.test');
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test('test environment never creates a real SMTP transport', async () => {
        configureValidSmtp();
        process.env.NODE_ENV = 'test';
        const result = await mailer.sendMail({
            to: 'employee@example.test', subject: 'Safe subject', text: 'Safe body'
        });
        expect(result.reason).toBe('EMAIL_TEST_MODE');
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('successful send reuses a STARTTLS transporter with configured timeouts', async () => {
        configureValidSmtp();
        const transport = {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
            verify: jest.fn().mockResolvedValue(true)
        };
        nodemailer.createTransport.mockReturnValue(transport);

        const first = await mailer.sendMail({
            to: 'employee@example.test', subject: 'Safe subject', text: 'Plain body', html: '<p>HTML body</p>'
        });
        const second = await mailer.sendMail({
            to: 'manager@example.test', subject: 'Second subject', text: 'Second body'
        });

        expect(first).toEqual({ sent: true, skipped: false, messageId: 'mock-message-id' });
        expect(second.sent).toBe(true);
        expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            host: 'smtp.example.test', port: 587, secure: false, requireTLS: true,
            connectionTimeout: 7000, greetingTimeout: 8000, socketTimeout: 9000
        }));
        expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'employee@example.test', text: 'Plain body', html: '<p>HTML body</p>'
        }));
    });


    test('development test redirect preserves the intended recipient in message metadata and masks it in results', async () => {
        configureValidSmtp();
        process.env.EMAIL_TEST_MODE = 'true';
        process.env.EMAIL_TEST_REDIRECT_TO = 'controlled@example.test';
        const transport = {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'redirect-message-id' })
        };
        nodemailer.createTransport.mockReturnValue(transport);

        const result = await mailer.sendMail({
            to: 'kumar@wypledu.online', subject: 'Leave request approved', text: 'Approved.'
        });

        expect(result).toEqual(expect.objectContaining({
            sent: true,
            redirected: true,
            originalRecipient: 'k****@wypledu.online'
        }));
        expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'controlled@example.test',
            headers: {
                'X-Leave-System-Test-Redirect': 'true',
                'X-Leave-System-Original-Recipient': 'kumar@wypledu.online'
            }
        }));
    });

    test('production refuses development test redirect and keeps the intended recipient', async () => {
        configureValidSmtp();
        process.env.NODE_ENV = 'production';
        process.env.EMAIL_TEST_MODE = 'true';
        process.env.EMAIL_TEST_REDIRECT_TO = 'controlled@example.test';
        const transport = { sendMail: jest.fn().mockResolvedValue({ messageId: 'production-message-id' }) };
        nodemailer.createTransport.mockReturnValue(transport);

        const result = await mailer.sendMail({
            to: 'diana@wypledu.online', subject: 'Manager review required', text: 'Review.'
        });
        expect(result.redirected).toBeUndefined();
        expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'diana@wypledu.online'
        }));
    });

    test('SMTP authentication failure is categorized and sanitized', async () => {
        configureValidSmtp();
        const transport = {
            sendMail: jest.fn().mockRejectedValue({
                code: 'EAUTH', message: 'Invalid login with unit-test-secret'
            })
        };
        nodemailer.createTransport.mockReturnValue(transport);
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await mailer.sendMail({
            to: 'employee@example.test', subject: 'Safe subject', text: 'Safe body',
            context: { eventType: 'MANAGER_APPROVED', userId: 7, requestId: 12 }
        });
        expect(result.category).toBe('SMTP_AUTH_FAILED');
        expect(result.error).toMatch(/rejected authentication/i);
        expect(JSON.stringify([result, log.mock.calls])).not.toContain('unit-test-secret');
        log.mockRestore();
    });

    test('connection timeout is handled as a sanitized non-throwing result', async () => {
        configureValidSmtp();
        nodemailer.createTransport.mockReturnValue({
            sendMail: jest.fn().mockRejectedValue({ code: 'ETIMEDOUT', message: 'socket timeout details' })
        });
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await mailer.sendMail({
            to: 'employee@example.test', subject: 'Safe subject', text: 'Safe body'
        });
        expect(result).toEqual(expect.objectContaining({
            sent: false, skipped: false, reason: 'SEND_FAILED', category: 'SMTP_TIMEOUT'
        }));
        expect(result.error).not.toContain('socket timeout details');
        log.mockRestore();
    });

    test('invalid recipient is skipped before any transport is created', async () => {
        configureValidSmtp();
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await mailer.sendMail({
            to: 'victim@example.test\nBcc:other@example.test',
            subject: 'Safe subject', text: 'Safe body'
        });
        expect(result.reason).toBe('INVALID_RECIPIENT');
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test('notification templates escape dynamic HTML and keep comment body out of the subject', () => {
        const template = buildNotificationEmail({
            event: 'COMMENT_ADDED',
            requestId: 44,
            actorName: '<img src=x onerror=alert(1)>'
        }, 'full comment body should not become the subject');
        expect(template.subject).toBe('New comment on leave request REQ-44');
        expect(template.subject).not.toContain('full comment body');
        expect(template.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(template.html).not.toContain('<img src=x onerror=alert(1)>');
        expect(template.text).toContain('Sign in to the leave system');
    });
});
