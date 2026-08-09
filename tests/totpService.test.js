'use strict';

process.env.APP_SECRET = 'totp-test-secret';

const { authenticator } = require('otplib');
const {
  generateSecret,
  keyUri,
  qrDataUrl,
  verify,
  currentCode,
  encrypt,
  decrypt
} = require('../../backend/services/totpService');

describe('totpService', () => {
  test('generateSecret returns a base32 secret', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(10);
  });

  test('keyUri embeds the issuer, account and secret in an otpauth URL', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = keyUri('jane@example.com', secret);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('jane%40example.com');
    expect(uri).toContain('Innovare%20LMS');
    expect(uri).toContain(secret);
  });

  test('qrDataUrl returns an inline PNG data URL', async () => {
    const data = await qrDataUrl('otpauth://totp/Example');
    expect(data).toMatch(/^data:image\/png;base64,/);
  });

  test('verify accepts the current code and rejects wrong or malformed input', () => {
    const secret = generateSecret();
    const token = authenticator.generate(secret);

    expect(verify(token, secret)).toBe(true);
    expect(verify('000000', secret)).toBe(false);
    expect(verify('abc', secret)).toBe(false);
    expect(verify(token, null)).toBe(false);
  });

  test('currentCode returns a code for a real secret and null for missing secrets', () => {
    const secret = generateSecret();
    expect(currentCode(secret)).toMatch(/^\d{6}$/);
    expect(currentCode()).toBeNull();
  });

  test('encrypt/decrypt round-trip and do not leak plaintext in ciphertext', () => {
    const plain = 'super-secret';
    const blob = encrypt(plain);
    const again = encrypt(plain);

    expect(blob).not.toContain(plain);
    expect(decrypt(blob)).toBe(plain);
    expect(again).not.toBe(blob);

    const tampered = blob.replace('a', 'z');
    expect(decrypt(tampered)).toBeNull();
  });

  test('wrong APP_SECRET makes decrypt fail closed', () => {
    const plain = 'another-secret';
    const blob = encrypt(plain);

    process.env.APP_SECRET = 'different-secret';
    expect(decrypt(blob)).toBeNull();
  });
});
