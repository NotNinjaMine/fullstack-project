// Shared "encrypt a small secret at rest" helper — AES-256-GCM keyed from
// APP_SECRET. Used anywhere a value must be stored but later RECOVERED (not
// just hashed/compared), e.g. a TOTP secret or a saved SMTP/Twilio credential.
// Never throws on decrypt; a bad/foreign blob just comes back as null so
// callers can treat it as "not set" rather than crash.
const crypto = require('crypto');

const keyBuf = () =>
    crypto.createHash('sha256')
        .update(String(process.env.APP_SECRET || 'dev-only-insecure-secret'))
        .digest();

const encrypt = (plain) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
};

const decrypt = (blob) => {
    try {
        const [ivh, tagh, dh] = String(blob).split(':');
        if (!ivh || !tagh || !dh) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf(), Buffer.from(ivh, 'hex'));
        decipher.setAuthTag(Buffer.from(tagh, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(dh, 'hex')), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
};

module.exports = { encrypt, decrypt };
