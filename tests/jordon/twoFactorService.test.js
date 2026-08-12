'use strict';

process.env.APP_SECRET = 'test-secret';

jest.mock('../../server/models', () => ({
  User: {
    findByPk: jest.fn(async () => ({
      id: 1,
      email: 'demo@innovare.com',
      phone: '+6512345678',
      totpEnabled: false
    }))
  },
  TwoFactorChallenge: {
    update: jest.fn(async () => ({})),
    create: jest.fn(async (data) => ({ ...data, id: 1, attempts: 0, resendCount: 0, lastSentAt: null, save: async function () { return this; } })),
    findOne: jest.fn(async () => null)
  }
}));

jest.mock('../../server/services/mailer', () => ({
  sendTwoFactorEmail: jest.fn(async () => ({ sent: true, error: null })),
  isDemoAddress: jest.fn(() => false),
  demoRedirectActive: jest.fn(() => false)
}));

jest.mock('../../server/services/sms', () => ({
  sendSms: jest.fn(async () => ({ sent: true, error: null })),
  demoSmsRedirectActive: jest.fn(() => false)
}));

jest.mock('../../server/services/totpService', () => ({
  currentCode: jest.fn(() => '123456'),
  decrypt: jest.fn(() => 'secret'),
  verify: jest.fn((token) => token === '123456')
}));

const {
  CODE_LENGTH,
  TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_COOLDOWN_SECONDS,
  generateCode,
  sha256,
  maskEmail,
  maskPhone,
  availableMethods
} = require('../../server/services/twoFactorService');

describe('twoFactorService pure helpers', () => {
  test('generateCode always returns a 6-digit string', () => {
    const values = Array.from({ length: 20 }, () => generateCode());
    values.forEach((value) => {
      expect(value).toMatch(/^\d{6}$/);
    });
    expect(CODE_LENGTH).toBe(6);
  });

  test('sha256 is deterministic and different for different input', () => {
    const first = sha256('123456');
    const second = sha256('123456');
    const third = sha256('654321');

    expect(first).toBe(second);
    expect(first).not.toBe(third);
    expect(first).not.toContain('123456');
  });

  test('maskEmail hides the middle and preserves the domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j••••••e@example.com');
    expect(maskEmail('ab@example.com')).toBe('a@example.com');
    expect(maskEmail()).toBe('your email');
  });

  test('maskPhone preserves the leading + and only shows the last four digits', () => {
    expect(maskPhone('+6512345678')).toBe('+••••••5678');
    expect(maskPhone('1234')).toBe('••1234');
    expect(maskPhone()).toBe('your phone');
  });

  test('availableMethods exposes email and optional SMS/authenticator choices', () => {
    const methods = availableMethods({ email: 'user@example.com', phone: null, totpEnabled: false });
    expect(methods).toHaveLength(3);
    expect(methods[0]).toMatchObject({ method: 'EMAIL', available: true });
    expect(methods[1]).toMatchObject({ method: 'SMS', available: false, reason: 'No phone number saved on this account.' });
    expect(methods[2]).toMatchObject({ method: 'AUTHENTICATOR', available: false, reason: 'Not set up. Enable it under My account → Authenticator.' });
  });

  test('policy constants match the documented 2FA limits', () => {
    expect(TTL_MINUTES).toBe(10);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(MAX_RESENDS).toBe(3);
    expect(RESEND_COOLDOWN_SECONDS).toBe(30);
  });
});
