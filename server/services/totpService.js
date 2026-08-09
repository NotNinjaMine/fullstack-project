// M1 (2FA): authenticator-app (TOTP) support — the "Microsoft Authenticator"
// option. TOTP (RFC 6238) is the open standard behind Microsoft Authenticator,
// Google Authenticator, Authy, 1Password, etc., so a single implementation
// works with all of them. The user scans a QR code once (enrolment), and from
// then on their app shows a fresh 6-digit code every 30 seconds that we verify
// against the shared secret. Nothing is emailed or texted for this method.
//
// Unlike email/SMS codes (which we generate, hash and store per challenge), a
// TOTP secret must be RECOVERABLE to verify future codes, so it cannot be
// hashed. Instead it is encrypted at rest with AES-256-GCM using a key derived
// from APP_SECRET, and only ever decrypted in memory at verify time.
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const secretCrypto = require('./secretCrypto');

// Accept the code from the previous/next 30s window too, so a small clock
// difference between the phone and the server doesn't reject a valid code.
authenticator.options = { window: 1 };

// Shown as the account issuer inside the authenticator app.
const ISSUER = 'Innovare LMS';

// ---- secret generation / verification -------------------------------------

const generateSecret = () => authenticator.generateSecret(); // base32

// otpauth:// URI the QR code encodes and that apps can also accept typed in.
const keyUri = (email, secret) => authenticator.keyuri(email, ISSUER, secret);

const qrDataUrl = (otpauthUrl) =>
    QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 220 });

const verify = (token, secret) => {
    if (!secret) return false;
    const clean = String(token || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) return false;
    try {
        return authenticator.verify({ token: clean, secret });
    } catch {
        return false;
    }
};

// The full 6-digit code a real authenticator app would be showing right now.
// Used ONLY to display the code on screen for demo accounts (mirroring the
// email/SMS demo affordance in mailer.js/sms.js) — a live authenticator app is
// never asked to show anyone else's code, and this is never returned for a
// real (non-demo) account. Plain read of "now" via the shared singleton;
// doesn't set any epoch override, so there's nothing to leak between calls.
const currentCode = (secret) => {
    if (!secret) return null;
    try {
        return authenticator.generate(secret);
    } catch {
        return null;
    }
};

// ---- encryption at rest (AES-256-GCM, shared helper) -----------------------

const encrypt = secretCrypto.encrypt;
const decrypt = secretCrypto.decrypt;

module.exports = {
    ISSUER, generateSecret, keyUri, qrDataUrl, verify, currentCode, encrypt, decrypt
};
